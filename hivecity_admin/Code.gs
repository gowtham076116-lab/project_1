/**
 * =============================================================================
 * HIVE CITY - SECURE GOOGLE APPS SCRIPT MULTI-TAB TRACKING WEB APP (Code.gs)
 * =============================================================================
 *
 * Spreadsheet ID: 1rWmHiVDvbZpLXZOUCPv9cf8pmU3lt-Jps_Dr0n6MikQ
 *
 * Manages 3 tabs securely via authenticated server-to-server POST requests:
 *   1. "Users" (Columns A-I):
 *      Firebase_UID | Email | Display_Name | Registration_Date | Last_SignIn |
 *      Status | Provider | Mobile | Updated At
 *   2. "sponsors details" (Columns A-I):
 *      Sponsor_ID | Sponsor_Name | Company_Details | Company_Link |
 *      LinkedIn_Profile | Company_Location | Sponsorship_Amount | Package_Type | Created_At
 *   3. "Ticketing & bookings" (Columns A-I):
 *      Booking_ID | Event_ID | Event_Name | User_ID | User_Name | User_Email |
 *      Booking_Status | Fee_Amount | Booked_At
 *
 * SECURITY ARCHITECTURE:
 * 1. Public GET is disabled: doGet(e) returns 403 Forbidden.
 * 2. All POST actions require the shared secret stored in Script Properties
 *    (APPS_SCRIPT_SHARED_SECRET or APPS_SCRIPT_SECRET).
 * 3. Primary-key deduplication prevents duplicate rows on repeated upserts.
 *
 * DEPLOYMENT INSTRUCTIONS:
 * 1. Open spreadsheet 1rWmHiVDvbZpLXZOUCPv9cf8pmU3lt-Jps_Dr0n6MikQ -> Extensions > Apps Script.
 * 2. Replace Code.gs with this entire file and Save.
 * 3. Ensure Project Settings > Script Properties has APPS_SCRIPT_SHARED_SECRET set.
 * 4. Click Deploy > Manage deployments > Edit (pencil) > Version: "New version" > Deploy.
 * =============================================================================
 */

var SPREADSHEET_ID = "1rWmHiVDvbZpLXZOUCPv9cf8pmU3lt-Jps_Dr0n6MikQ";

var DEFAULT_SHEET_NAME = "Users";
var SPONSORS_SHEET_NAME = "sponsors details";
var BOOKINGS_SHEET_NAME = "Ticketing & bookings";
var COMMUNITY_SESSIONS_SHEET_NAME = "Community Sessions";
var FINANCE_SHEET_NAME = "Revenue & Finance";
var NOTIFICATIONS_SHEET_NAME = "Notifications";
var SUPPORT_CENTRE_SHEET_NAME = "Support Centre";

var HEADERS = [
  "Firebase_UID",
  "Email",
  "Display_Name",
  "Registration_Date",
  "Last_SignIn",
  "Status",
  "Provider",
  "Mobile",
  "Updated At"
];

var SPONSORS_HEADERS = [
  "Sponsor_ID",
  "Sponsor_Name",
  "Company_Details",
  "Company_Link",
  "LinkedIn_Profile",
  "Company_Location",
  "Sponsorship_Amount",
  "Package_Type",
  "Created_At"
];

var BOOKINGS_HEADERS = [
  "Booking_ID",
  "Event_ID",
  "Event_Name",
  "User_ID",
  "User_Name",
  "User_Email",
  "Booking_Status",
  "Fee_Amount",
  "Booked_At"
];

var COMMUNITY_SESSIONS_HEADERS = [
  "Registration_ID",
  "Session_ID",
  "Session_Title",
  "User_ID",
  "User_Name",
  "User_Email",
  "Session_Type",
  "Registration_Status",
  "Payment_Status",
  "Amount_Paid",
  "Payment_ID",
  "Updated_At"
];

var FINANCE_HEADERS = [
  "Payment_ID",
  "Source",
  "Reference_ID",
  "Session_Or_Event_Name",
  "User_ID",
  "User_Email",
  "Gross_Amount",
  "Refund_Amount",
  "Net_Amount",
  "Currency",
  "Payment_Status",
  "Verified_At"
];

/**
 * Handle GET requests:
 * Strictly locked down to prevent unauthorized public exposure of spreadsheet records.
 */
function doGet(e) {
  return jsonResponse({
    status: "error",
    message: "Direct public spreadsheet access is disabled. Use authenticated server endpoints."
  }, 403);
}

/**
 * Resolve target spreadsheet by explicit ID with active spreadsheet fallback.
 */
function getTargetSpreadsheet() {
  try {
    if (SPREADSHEET_ID) {
      return SpreadsheetApp.openById(SPREADSHEET_ID);
    }
  } catch (err) {
    // Fallback to bound active spreadsheet if openById is unavailable
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Handle POST requests:
 * Authenticated server-to-server gateway supporting Users, sponsors details, and Ticketing & bookings.
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    var payload = {};
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (jsonErr) {
        payload = e.parameter || {};
      }
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    // 1. Shared secret authentication (supports APPS_SCRIPT_SHARED_SECRET or APPS_SCRIPT_SECRET)
    var props = PropertiesService.getScriptProperties();
    var scriptSecret = String(
      props.getProperty("APPS_SCRIPT_SHARED_SECRET") ||
      props.getProperty("APPS_SCRIPT_SECRET") ||
      ""
    ).trim();
    var requestSecret = String(
      payload.secret ||
      payload.sharedSecret ||
      payload.APPS_SCRIPT_SHARED_SECRET ||
      ""
    ).trim();

    if (!scriptSecret) {
      return jsonResponse({
        status: "error",
        code: "SCRIPT_SECRET_NOT_CONFIGURED",
        message: "Server secret is not configured in Apps Script Properties (set APPS_SCRIPT_SHARED_SECRET or APPS_SCRIPT_SECRET)."
      }, 500);
    }

    if (!requestSecret || requestSecret !== scriptSecret) {
      return jsonResponse({
        status: "error",
        code: "UNAUTHORIZED_SECRET",
        message: "Unauthorized: Invalid or missing server secret."
      }, 401);
    }

    var action = String(payload.action || "upsert_user").trim().toLowerCase();
    var ss = getTargetSpreadsheet();
    var ensuredTabs = ensureAllSheetsExist(ss);

    // --- INIT ALL 3 TABS ---
    if (action === "init_sheets") {
      return jsonResponse({
        status: "success",
        spreadsheetId: ss.getId(),
        tabs: ensuredTabs
      }, 200);
    }

    // --- TAB 2: sponsors details ---
    if (action === "read_sponsors") {
      var spSheet = getOrCreateNamedSheet(ss, SPONSORS_SHEET_NAME, SPONSORS_HEADERS);
      return handleReadSponsors(spSheet);
    }
    if (action === "upsert_sponsor") {
      var spSheetUp = getOrCreateNamedSheet(ss, SPONSORS_SHEET_NAME, SPONSORS_HEADERS);
      return handleUpsertSponsor(spSheetUp, payload);
    }
    if (action === "delete_sponsor") {
      var spSheetDel = getOrCreateNamedSheet(ss, SPONSORS_SHEET_NAME, SPONSORS_HEADERS);
      return handleDeleteSponsor(spSheetDel, payload);
    }

    // --- TAB 3: Ticketing & bookings ---
    if (action === "read_bookings") {
      var bkSheet = getOrCreateNamedSheet(ss, BOOKINGS_SHEET_NAME, BOOKINGS_HEADERS);
      return handleReadBookings(bkSheet);
    }
    if (action === "upsert_booking") {
      var bkSheetUp = getOrCreateNamedSheet(ss, BOOKINGS_SHEET_NAME, BOOKINGS_HEADERS);
      return handleUpsertBooking(bkSheetUp, payload);
    }
    if (action === "batch_upsert_bookings") {
      var bkSheetBatch = getOrCreateNamedSheet(ss, BOOKINGS_SHEET_NAME, BOOKINGS_HEADERS);
      return handleBatchUpsertBookings(bkSheetBatch, payload);
    }
    if (action === "cancel_booking") {
      var bkSheetCancel = getOrCreateNamedSheet(ss, BOOKINGS_SHEET_NAME, BOOKINGS_HEADERS);
      return handleCancelBooking(bkSheetCancel, payload);
    }
    if (action === "delete_booking") {
      var bkSheetDel = getOrCreateNamedSheet(ss, BOOKINGS_SHEET_NAME, BOOKINGS_HEADERS);
      return handleDeleteBooking(bkSheetDel, payload);
    }

    // --- TAB 4: Community Sessions ---
    if (action === "read_session_registrations") {
      var csSheetRead = getOrCreateNamedSheet(ss, COMMUNITY_SESSIONS_SHEET_NAME, COMMUNITY_SESSIONS_HEADERS);
      return handleReadSessionRegistrations(csSheetRead);
    }
    if (action === "upsert_session_registration") {
      var csSheetUp = getOrCreateNamedSheet(ss, COMMUNITY_SESSIONS_SHEET_NAME, COMMUNITY_SESSIONS_HEADERS);
      return handleUpsertSessionRegistration(csSheetUp, payload);
    }

    // --- TAB 5: Revenue & Finance ---
    if (action === "read_finance_records") {
      var finSheetRead = getOrCreateNamedSheet(ss, FINANCE_SHEET_NAME, FINANCE_HEADERS);
      return handleReadFinanceRecords(finSheetRead);
    }
    if (action === "upsert_finance_record") {
      var finSheetUp = getOrCreateNamedSheet(ss, FINANCE_SHEET_NAME, FINANCE_HEADERS);
      return handleUpsertFinanceRecord(finSheetUp, payload);
    }

    // --- TAB 6: Notifications (Word/Paragraph Document Format, No Gridlines) ---
    if (action === "append_notification") {
      var notifSheet = getOrCreateNotificationsDocSheet(ss);
      return handleAppendNotification(notifSheet, payload);
    }

    // --- TAB 7: Support Centre (Word/Paragraph Document Format, No Gridlines) ---
    if (action === "upsert_support_ticket") {
      var supSheet = getOrCreateSupportDocSheet(ss);
      return handleUpsertSupportTicket(supSheet, payload);
    }

    // --- TAB 1: Users ---
    var sheet = getTargetUsersSheet(ss);

    if (action === "read_users") {
      return handleReadUsers(sheet);
    }

    if (action === "batch_upsert_users") {
      return handleBatchUpsertUsers(sheet, payload);
    }

    return handleUpsertUser(sheet, payload);

  } catch (error) {
    return jsonResponse({
      status: "error",
      message: error.toString()
    }, 500);
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================================
 * TAB 1: USERS (Columns A-I)
 * ============================================================================ */

function normalizeSheetStatus(rawStatus, emailVerified) {
  var s = String(rawStatus || "").trim().toLowerCase();
  if (s === "blocked") return "Blocked";
  if (s === "restricted") return "Restricted";
  if (s === "suspended") return "Suspended";
  if (s.indexOf("pending") !== -1 || emailVerified === false) {
    return "Pending Verification";
  }
  if (s === "verified" || s === "active" || emailVerified === true) {
    return "Verified";
  }
  return "Verified";
}

function handleReadUsers(sheet) {
  var data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    return jsonResponse({
      status: "success",
      sheetName: sheet.getName(),
      count: 0,
      users: []
    }, 200);
  }

  var users = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var uid = String(row[0] || "").trim();
    var email = String(row[1] || "").trim();
    if (!uid && !email) continue;

    var statusStr = String(row[5] || "Verified").trim();
    var regDate = formatDateValue(row[3]);
    var lastSignIn = formatDateValue(row[4]);

    users.push({
      uid: uid,
      Firebase_UID: uid,
      email: email,
      displayName: String(row[2] || ""),
      registrationDate: regDate,
      lastSignIn: lastSignIn,
      lastLogin: lastSignIn,
      status: statusStr,
      emailVerified: statusStr.toLowerCase().indexOf("pending") === -1,
      provider: String(row[6] || "password"),
      mobile: String(row[7] || ""),
      updatedAt: formatDateValue(row[8])
    });
  }

  return jsonResponse({
    status: "success",
    sheetName: sheet.getName(),
    count: users.length,
    users: users
  }, 200);
}

function upsertSingleUserRecord(sheet, record) {
  var uid = String(record.uid || record.Firebase_UID || record.userId || "").trim();
  var email = String(record.email || record.Email || "").trim().toLowerCase();
  var displayName = String(record.displayName || record.Display_Name || record.name || "").trim();
  if (!displayName) {
    displayName = email ? email.split("@")[0] : "Athlete";
  }
  var nowIso = new Date().toISOString();
  var registrationDate = String(
    record.registrationDate || record.Registration_Date || record.createdAt || nowIso
  ).trim();
  var lastSignIn = String(
    record.lastSignIn || record.Last_SignIn || record.lastLogin || record.lastLoginAt || nowIso
  ).trim();
  var status = normalizeSheetStatus(record.status || record.Status, record.emailVerified);
  var provider = String(record.provider || record.Provider || "password").trim();
  var mobile = String(record.mobile || record.Mobile || record.phone || "").trim();
  var updatedAt = nowIso;

  if (!uid) {
    return { ok: false, error: "Missing primary key: Firebase_UID is required." };
  }

  var data = sheet.getDataRange().getValues();
  var primaryRowIndex = -1;
  var duplicateRowIndices = [];

  for (var i = 1; i < data.length; i++) {
    var rowUid = String(data[i][0] || "").trim();
    var rowEmail = String(data[i][1] || "").trim().toLowerCase();

    if (rowUid === uid) {
      if (primaryRowIndex === -1) {
        primaryRowIndex = i + 1;
      } else {
        duplicateRowIndices.push(i + 1);
      }
    } else if (primaryRowIndex === -1 && email && rowEmail === email && !rowUid) {
      primaryRowIndex = i + 1;
    }
  }

  var actionResult = "appended";

  if (primaryRowIndex > 0) {
    actionResult = "updated";
    var existingRow = data[primaryRowIndex - 1];
    var existingDisplayName = String(existingRow[2] || "").trim();
    var existingRegDate = existingRow[3];
    var existingMobile = String(existingRow[7] || "").trim();

    var finalDisplayName =
      displayName && displayName !== "Athlete"
        ? displayName
        : (existingDisplayName || displayName);
    var finalRegDate = existingRegDate ? formatDateValue(existingRegDate) : registrationDate;
    var finalMobile = mobile || existingMobile;

    sheet.getRange(primaryRowIndex, 1, 1, 9).setValues([[
      uid,
      email || String(existingRow[1] || "").trim(),
      finalDisplayName,
      finalRegDate,
      lastSignIn || formatDateValue(existingRow[4]),
      status,
      provider || String(existingRow[6] || "password").trim(),
      finalMobile,
      updatedAt
    ]]);

    for (var d = duplicateRowIndices.length - 1; d >= 0; d--) {
      sheet.deleteRow(duplicateRowIndices[d]);
    }
  } else {
    var nextRow = Math.max(2, sheet.getLastRow() + 1);
    sheet.getRange(nextRow, 1, 1, 9).setValues([[
      uid,
      email,
      displayName,
      registrationDate,
      lastSignIn,
      status,
      provider,
      mobile,
      updatedAt
    ]]);
  }

  return {
    ok: true,
    action: actionResult,
    uid: uid,
    email: email,
    lastSignIn: lastSignIn
  };
}

function handleUpsertUser(sheet, payload) {
  var result = upsertSingleUserRecord(sheet, payload);
  if (!result.ok) {
    return jsonResponse({
      status: "error",
      message: result.error
    }, 400);
  }
  return jsonResponse({
    status: "success",
    sheetName: sheet.getName(),
    action: result.action,
    uid: result.uid,
    lastSignIn: result.lastSignIn,
    lastLogin: result.lastSignIn
  }, 200);
}

function handleBatchUpsertUsers(sheet, payload) {
  var list = Array.isArray(payload.users) ? payload.users : [];
  var created = 0;
  var updated = 0;
  var skipped = 0;
  var failed = 0;
  var errors = [];

  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    if (!item || typeof item !== "object") {
      skipped++;
      continue;
    }
    try {
      var res = upsertSingleUserRecord(sheet, item);
      if (res.ok) {
        if (res.action === "updated") updated++;
        else created++;
      } else {
        skipped++;
        errors.push({ index: i, message: res.error });
      }
    } catch (err) {
      failed++;
      errors.push({ index: i, message: err.toString() });
    }
  }

  return jsonResponse({
    status: "success",
    sheetName: sheet.getName(),
    total: list.length,
    synced: created + updated,
    created: created,
    updated: updated,
    skipped: skipped,
    failed: failed,
    errors: errors.slice(0, 20)
  }, 200);
}

/* ============================================================================
 * TAB 2: sponsors details (Columns A-I)
 * ============================================================================ */

function handleReadSponsors(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return jsonResponse({
      status: "success",
      sheetName: sheet.getName(),
      count: 0,
      sponsors: []
    }, 200);
  }

  var sponsors = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var sponsorId = String(row[0] || "").trim();
    var sponsorName = String(row[1] || "").trim();
    if (!sponsorId && !sponsorName) continue;

    sponsors.push({
      id: sponsorId || ("SPN-ROW-" + (i + 1)),
      Sponsor_ID: sponsorId || ("SPN-ROW-" + (i + 1)),
      sponsorName: sponsorName,
      companyDetails: String(row[2] || "").trim(),
      companyLink: String(row[3] || "").trim(),
      linkedinProfile: String(row[4] || "").trim(),
      companyLocation: String(row[5] || "").trim(),
      sponsorshipAmount: Number(String(row[6] || "0").replace(/[^0-9.]/g, "")) || 0,
      packageType: String(row[7] || "Monthly").trim() === "Yearly" ? "Yearly" : "Monthly",
      createdAt: formatDateValue(row[8])
    });
  }

  return jsonResponse({
    status: "success",
    sheetName: sheet.getName(),
    count: sponsors.length,
    sponsors: sponsors
  }, 200);
}

function handleUpsertSponsor(sheet, payload) {
  var record = payload.sponsor || payload;
  var sponsorId = String(record.id || record.Sponsor_ID || record.sponsorId || "").trim();
  if (!sponsorId) {
    sponsorId = "SPN-" + new Date().getTime();
  }
  var sponsorName = String(record.sponsorName || record.Sponsor_Name || "").trim();
  if (!sponsorName) {
    return jsonResponse({ status: "error", message: "Sponsor_Name is required." }, 400);
  }
  var companyDetails = String(record.companyDetails || record.Company_Details || "").trim();
  var companyLink = String(record.companyLink || record.Company_Link || "").trim();
  var linkedinProfile = String(record.linkedinProfile || record.LinkedIn_Profile || "").trim();
  var companyLocation = String(record.companyLocation || record.Company_Location || "").trim();
  var sponsorshipAmount = Number(String(record.sponsorshipAmount || record.Sponsorship_Amount || "0").replace(/[^0-9.]/g, "")) || 0;
  var packageType = String(record.packageType || record.Package_Type || "Monthly").trim() === "Yearly" ? "Yearly" : "Monthly";
  var createdAt = String(record.createdAt || record.Created_At || new Date().toISOString()).trim();

  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || "").trim() === sponsorId) {
      rowIndex = i + 1;
      break;
    }
  }

  var rowValues = [[
    sponsorId,
    sponsorName,
    companyDetails,
    companyLink,
    linkedinProfile,
    companyLocation,
    sponsorshipAmount,
    packageType,
    createdAt
  ]];

  var actionResult = "appended";
  if (rowIndex > 0) {
    actionResult = "updated";
    sheet.getRange(rowIndex, 1, 1, 9).setValues(rowValues);
  } else {
    var nextRow = Math.max(2, sheet.getLastRow() + 1);
    sheet.getRange(nextRow, 1, 1, 9).setValues(rowValues);
  }

  return jsonResponse({
    status: "success",
    sheetName: sheet.getName(),
    action: actionResult,
    sponsorId: sponsorId
  }, 200);
}

function handleDeleteSponsor(sheet, payload) {
  var sponsorId = String(payload.sponsorId || payload.id || payload.Sponsor_ID || "").trim();
  if (!sponsorId) {
    return jsonResponse({ status: "error", message: "sponsorId is required." }, 400);
  }
  var data = sheet.getDataRange().getValues();
  var deleted = 0;
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0] || "").trim() === sponsorId) {
      sheet.deleteRow(i + 1);
      deleted++;
    }
  }
  return jsonResponse({
    status: "success",
    sheetName: sheet.getName(),
    sponsorId: sponsorId,
    deleted: deleted
  }, 200);
}

/* ============================================================================
 * TAB 3: Ticketing & bookings (Columns A-I)
 * ============================================================================ */

function handleReadBookings(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return jsonResponse({
      status: "success",
      sheetName: sheet.getName(),
      count: 0,
      bookings: []
    }, 200);
  }

  var bookings = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var bookingId = String(row[0] || "").trim();
    var eventId = String(row[1] || "").trim();
    if (!bookingId && !eventId) continue;

    bookings.push({
      id: bookingId,
      Booking_ID: bookingId,
      eventId: eventId,
      eventTitle: String(row[2] || "").trim(),
      userId: String(row[3] || "").trim(),
      userName: String(row[4] || "").trim(),
      userEmail: String(row[5] || "").trim(),
      status: String(row[6] || "Booked").trim(),
      feeAmount: Number(String(row[7] || "0").replace(/[^0-9.]/g, "")) || 0,
      bookedAt: formatDateValue(row[8])
    });
  }

  return jsonResponse({
    status: "success",
    sheetName: sheet.getName(),
    count: bookings.length,
    bookings: bookings
  }, 200);
}

function upsertSingleBookingRecord(sheet, record) {
  var bookingId = String(record.id || record.Booking_ID || record.bookingId || "").trim();
  var eventId = String(record.eventId || record.Event_ID || "").trim();
  var eventName = String(record.eventTitle || record.eventName || record.Event_Name || "Hivecity Event").trim();
  var userId = String(record.userId || record.User_ID || "guest-athlete").trim();
  var userName = String(record.userName || record.User_Name || "Hive Athlete").trim();
  var userEmail = String(record.userEmail || record.User_Email || "").trim();
  var bookingStatus = String(record.bookingStatus || record.Booking_Status || record.status || "Booked").trim();
  var feeAmount = Number(String(record.feeAmount || record.Fee_Amount || "0").replace(/[^0-9.]/g, "")) || 0;
  var bookedAt = String(record.bookedAt || record.Booked_At || new Date().toISOString()).trim();

  if (!bookingId) {
    bookingId = (eventId || "evt") + "_" + (userId || "user") + "_" + new Date().getTime();
  }

  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || "").trim() === bookingId) {
      rowIndex = i + 1;
      break;
    }
  }

  var rowValues = [[
    bookingId,
    eventId,
    eventName,
    userId,
    userName,
    userEmail,
    bookingStatus,
    feeAmount,
    bookedAt
  ]];

  var actionResult = "appended";
  if (rowIndex > 0) {
    actionResult = "updated";
    sheet.getRange(rowIndex, 1, 1, 9).setValues(rowValues);
  } else {
    var nextRow = Math.max(2, sheet.getLastRow() + 1);
    sheet.getRange(nextRow, 1, 1, 9).setValues(rowValues);
  }

  return { ok: true, action: actionResult, bookingId: bookingId };
}

function handleUpsertBooking(sheet, payload) {
  var record = payload.booking || payload;
  var res = upsertSingleBookingRecord(sheet, record);
  return jsonResponse({
    status: "success",
    sheetName: sheet.getName(),
    action: res.action,
    bookingId: res.bookingId
  }, 200);
}

function handleBatchUpsertBookings(sheet, payload) {
  var list = Array.isArray(payload.bookings) ? payload.bookings : [];
  var synced = 0;
  for (var i = 0; i < list.length; i++) {
    if (list[i] && typeof list[i] === "object") {
      upsertSingleBookingRecord(sheet, list[i]);
      synced++;
    }
  }
  return jsonResponse({
    status: "success",
    sheetName: sheet.getName(),
    synced: synced
  }, 200);
}

function handleCancelBooking(sheet, payload) {
  var record = payload.booking || payload;
  var bookingId = String(record.id || record.Booking_ID || record.bookingId || "").trim();
  var eventId = String(record.eventId || record.Event_ID || "").trim();
  var userId = String(record.userId || record.User_ID || "").trim();
  var nowIso = new Date().toISOString();

  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    var rowBid = String(data[i][0] || "").trim();
    var rowEid = String(data[i][1] || "").trim();
    var rowUid = String(data[i][3] || "").trim();
    if ((bookingId && rowBid === bookingId) || (eventId && userId && rowEid === eventId && rowUid === userId)) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex > 0) {
    var existing = data[rowIndex - 1];
    sheet.getRange(rowIndex, 1, 1, 9).setValues([[
      String(existing[0] || bookingId),
      String(existing[1] || eventId),
      String(existing[2] || record.eventTitle || record.eventName || record.Event_Name || "Hivecity Event"),
      String(existing[3] || userId),
      String(existing[4] || record.userName || record.User_Name || "Hive Athlete"),
      String(existing[5] || record.userEmail || record.User_Email || ""),
      "Cancelled",
      existing[7] !== "" && existing[7] !== null && existing[7] !== undefined ? existing[7] : (Number(String(record.feeAmount || "0").replace(/[^0-9.]/g, "")) || 0),
      nowIso
    ]]);
    return jsonResponse({
      status: "success",
      sheetName: sheet.getName(),
      action: "cancelled",
      bookingId: String(existing[0] || bookingId)
    }, 200);
  }

  // If no existing row found, append an explicit Cancelled audit record
  var res = upsertSingleBookingRecord(sheet, {
    id: bookingId,
    eventId: eventId,
    eventTitle: record.eventTitle || record.eventName || record.Event_Name || "Hivecity Event",
    userId: userId || "guest-athlete",
    userName: record.userName || record.User_Name || "Hive Athlete",
    userEmail: record.userEmail || record.User_Email || "",
    bookingStatus: "Cancelled",
    feeAmount: record.feeAmount || 0,
    bookedAt: nowIso
  });
  return jsonResponse({
    status: "success",
    sheetName: sheet.getName(),
    action: "cancelled",
    bookingId: res.bookingId
  }, 200);
}

function handleDeleteBooking(sheet, payload) {
  var bookingId = String(payload.bookingId || payload.id || payload.Booking_ID || "").trim();
  var eventId = String(payload.eventId || payload.Event_ID || "").trim();
  var userId = String(payload.userId || payload.User_ID || "").trim();
  var data = sheet.getDataRange().getValues();
  var deleted = 0;
  for (var i = data.length - 1; i >= 1; i--) {
    var rowBid = String(data[i][0] || "").trim();
    var rowEid = String(data[i][1] || "").trim();
    var rowUid = String(data[i][3] || "").trim();
    if ((bookingId && rowBid === bookingId) || (eventId && userId && rowEid === eventId && rowUid === userId)) {
      sheet.deleteRow(i + 1);
      deleted++;
    }
  }
  return jsonResponse({
    status: "success",
    sheetName: sheet.getName(),
    deleted: deleted
  }, 200);
}

/* ============================================================================
 * TAB 4: Community Sessions (Columns A-L)
 * ============================================================================ */

function handleReadSessionRegistrations(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return jsonResponse({
      status: "success",
      sheetName: sheet.getName(),
      count: 0,
      registrations: []
    }, 200);
  }

  var registrations = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var regId = String(row[0] || "").trim();
    var sessionId = String(row[1] || "").trim();
    if (!regId && !sessionId) continue;
    registrations.push({
      registrationId: regId,
      sessionId: sessionId,
      sessionTitle: String(row[2] || "").trim(),
      userId: String(row[3] || "").trim(),
      userName: String(row[4] || "").trim(),
      userEmail: String(row[5] || "").trim(),
      sessionType: String(row[6] || "free").trim(),
      registrationStatus: String(row[7] || "pending").trim(),
      paymentStatus: String(row[8] || "free").trim(),
      amountPaid: Number(String(row[9] || "0").replace(/[^0-9.]/g, "")) || 0,
      paymentId: String(row[10] || "").trim(),
      updatedAt: formatDateValue(row[11])
    });
  }

  return jsonResponse({
    status: "success",
    sheetName: sheet.getName(),
    count: registrations.length,
    registrations: registrations
  }, 200);
}

function handleUpsertSessionRegistration(sheet, payload) {
  var record = payload.registration || payload;
  var regId = String(record.registrationId || record.Registration_ID || record.id || "").trim();
  var sessionId = String(record.sessionId || record.Session_ID || "").trim();
  var sessionTitle = String(record.sessionTitle || record.Session_Title || "Community Session").trim();
  var userId = String(record.userId || record.User_ID || "").trim();
  var userName = String(record.userName || record.User_Name || "Hive Athlete").trim();
  var userEmail = String(record.userEmail || record.User_Email || "").trim();
  var sessionType = String(record.sessionType || record.Session_Type || "free").trim().toLowerCase() === "paid" ? "paid" : "free";
  var regStatus = String(record.registrationStatus || record.Registration_Status || "confirmed").trim().toLowerCase();
  var payStatus = String(record.paymentStatus || record.Payment_Status || (sessionType === "free" ? "free" : "pending")).trim().toLowerCase();
  var amountPaid = Number(String(record.amountPaid || record.Amount_Paid || "0").replace(/[^0-9.]/g, "")) || 0;
  var paymentId = String(record.paymentId || record.Payment_ID || "").trim();
  var updatedAt = String(record.updatedAt || record.Updated_At || new Date().toISOString()).trim();

  if (!regId) {
    regId = (sessionId || "sess") + "_" + (userId || new Date().getTime());
  }

  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || "").trim() === regId) {
      rowIndex = i + 1;
      break;
    }
  }

  var rowValues = [[
    regId,
    sessionId,
    sessionTitle,
    userId,
    userName,
    userEmail,
    sessionType,
    regStatus,
    payStatus,
    amountPaid,
    paymentId,
    updatedAt
  ]];

  var actionResult = "appended";
  if (rowIndex > 0) {
    actionResult = "updated";
    sheet.getRange(rowIndex, 1, 1, 12).setValues(rowValues);
  } else {
    var nextRow = Math.max(2, sheet.getLastRow() + 1);
    sheet.getRange(nextRow, 1, 1, 12).setValues(rowValues);
  }

  return jsonResponse({
    status: "success",
    sheetName: sheet.getName(),
    action: actionResult,
    registrationId: regId
  }, 200);
}

/* ============================================================================
 * TAB 5: Revenue & Finance (Columns A-L)
 * ============================================================================ */

function handleReadFinanceRecords(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return jsonResponse({
      status: "success",
      sheetName: sheet.getName(),
      count: 0,
      records: []
    }, 200);
  }
  var records = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var paymentId = String(row[0] || "").trim();
    if (!paymentId) continue;
    records.push({
      paymentId: paymentId,
      source: String(row[1] || "").trim(),
      referenceId: String(row[2] || "").trim(),
      name: String(row[3] || "").trim(),
      userId: String(row[4] || "").trim(),
      userEmail: String(row[5] || "").trim(),
      grossAmount: Number(String(row[6] || "0").replace(/[^0-9.]/g, "")) || 0,
      refundAmount: Number(String(row[7] || "0").replace(/[^0-9.]/g, "")) || 0,
      netAmount: Number(String(row[8] || "0").replace(/[^0-9.]/g, "")) || 0,
      currency: String(row[9] || "INR").trim(),
      paymentStatus: String(row[10] || "verified").trim().toLowerCase(),
      verifiedAt: formatDateValue(row[11])
    });
  }
  return jsonResponse({
    status: "success",
    sheetName: sheet.getName(),
    count: records.length,
    records: records
  }, 200);
}

function handleUpsertFinanceRecord(sheet, payload) {
  var rec = payload.record || payload;
  var paymentId = String(rec.paymentId || rec.Payment_ID || "").trim();
  var status = String(rec.paymentStatus || rec.Payment_Status || "").trim().toLowerCase();
  var grossAmount = Number(String(rec.grossAmount || rec.Gross_Amount || rec.amount || "0").replace(/[^0-9.]/g, "")) || 0;
  var refundAmount = Number(String(rec.refundAmount || rec.Refund_Amount || "0").replace(/[^0-9.]/g, "")) || 0;

  // Never write unverified pending, failed, or free (0) entries to Revenue & Finance
  if (!paymentId || (status !== "verified" && status !== "refunded") || grossAmount <= 0) {
    return jsonResponse({
      status: "skipped",
      message: "Only verified or refunded paid transactions are recorded in Revenue & Finance."
    }, 200);
  }

  var source = String(rec.source || rec.Source || "community_session").trim();
  var referenceId = String(rec.referenceId || rec.Reference_ID || rec.sessionId || rec.eventId || "").trim();
  var itemName = String(rec.name || rec.Session_Or_Event_Name || rec.sessionTitle || rec.eventTitle || "").trim();
  var userId = String(rec.userId || rec.User_ID || "").trim();
  var userEmail = String(rec.userEmail || rec.User_Email || "").trim();
  var currency = String(rec.currency || rec.Currency || "INR").trim().toUpperCase();
  var verifiedAt = String(rec.verifiedAt || rec.Verified_At || new Date().toISOString()).trim();

  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || "").trim() === paymentId) {
      rowIndex = i + 1;
      break;
    }
  }

  var finalGross = grossAmount;
  if (rowIndex > 0) {
    var existingGross = Number(String(data[rowIndex - 1][6] || "0").replace(/[^0-9.]/g, "")) || 0;
    if (existingGross > 0) finalGross = existingGross;
  }
  var finalRefund = status === "refunded" ? (refundAmount > 0 ? refundAmount : finalGross) : 0;
  var finalNet = Math.max(0, finalGross - finalRefund);

  var rowValues = [[
    paymentId,
    source,
    referenceId,
    itemName,
    userId,
    userEmail,
    finalGross,
    finalRefund,
    finalNet,
    currency,
    status,
    verifiedAt
  ]];

  var actionResult = "appended";
  if (rowIndex > 0) {
    actionResult = "updated";
    sheet.getRange(rowIndex, 1, 1, 12).setValues(rowValues);
  } else {
    var nextRow = Math.max(2, sheet.getLastRow() + 1);
    sheet.getRange(nextRow, 1, 1, 12).setValues(rowValues);
  }

  return jsonResponse({
    status: "success",
    sheetName: sheet.getName(),
    action: actionResult,
    paymentId: paymentId,
    netAmount: finalNet
  }, 200);
}

/* ============================================================================
 * TAB 6: Notifications (Word / Paragraph Document Format — No Table Gridlines)
 * ============================================================================ */

function getOrCreateNotificationsDocSheet(ss) {
  var sheet = ss.getSheetByName(NOTIFICATIONS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(NOTIFICATIONS_SHEET_NAME);
  }
  sheet.setHiddenGridlines(true);
  try {
    sheet.setColumnWidth(1, 900);
  } catch (e) { }
  return sheet;
}

function handleAppendNotification(sheet, payload) {
  var rec = payload.notification || payload;
  var category = String(rec.category || "Run").trim();
  var status = String(rec.deliveryStatus || "Delivered Successfully").trim();
  var title = String(rec.title || "Hivecity Announcement").trim();
  var message = String(rec.message || "").trim();
  var tsRaw = String(rec.sentAt || rec.resentAt || rec.createdAt || new Date().toISOString()).trim();
  var tsFormatted = tsRaw;
  try {
    var d = new Date(tsRaw);
    if (!isNaN(d.getTime())) {
      tsFormatted = Utilities.formatDate(d, Session.getScriptTimeZone() || "Asia/Kolkata", "dd MMM yyyy, hh:mm a");
    }
  } catch (e) { }

  var paragraph =
    "[" + category + " | " + status + " • " + tsFormatted + "]\n" +
    "Title: " + title + "\n" +
    "Message: " + message;

  sheet.setHiddenGridlines(true);
  var lastRow = sheet.getLastRow();
  var nextRow = lastRow === 0 ? 1 : lastRow + 2; // Blank spacing row between entries
  var cell = sheet.getRange(nextRow, 1);
  cell.setValue(paragraph);
  cell.setWrap(true);
  cell.setBorder(false, false, false, false, false, false);
  cell.setFontFamily("Arial");
  cell.setFontSize(11);
  cell.setFontColor("#1F2937");
  cell.setVerticalAlignment("top");

  return jsonResponse({
    status: "success",
    sheetName: sheet.getName(),
    row: nextRow
  }, 200);
}

/* ============================================================================
 * TAB 7: Support Centre (Word / Paragraph Document Format — No Table Gridlines)
 * ============================================================================ */

function getOrCreateSupportDocSheet(ss) {
  var sheet = ss.getSheetByName(SUPPORT_CENTRE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SUPPORT_CENTRE_SHEET_NAME);
  }
  sheet.setHiddenGridlines(true);
  try {
    sheet.setColumnWidth(1, 900);
  } catch (e) { }
  return sheet;
}

function handleUpsertSupportTicket(sheet, payload) {
  var rec = payload.ticket || payload;
  var ticketId = String(rec.id || rec.ticketId || ("SUP-" + new Date().getTime())).trim();
  var status = String(rec.status || "Open").trim();
  var userName = String(rec.userName || "Hive Athlete").trim();
  var mobile = String(rec.mobile || "").trim();
  var email = String(rec.email || "").trim();
  var subject = String(rec.subject || "Other").trim();
  var concern = String(rec.concern || rec.message || "").trim();
  var tsRaw = String(rec.updatedAt || rec.createdAt || new Date().toISOString()).trim();
  var tsFormatted = tsRaw;
  try {
    var d = new Date(tsRaw);
    if (!isNaN(d.getTime())) {
      tsFormatted = Utilities.formatDate(d, Session.getScriptTimeZone() || "Asia/Kolkata", "dd MMM yyyy, hh:mm a");
    }
  } catch (e) { }

  var contactParts = [];
  if (mobile) contactParts.push("Mobile: " + mobile);
  if (email) contactParts.push("Email: " + email);
  var contactStr = contactParts.length > 0 ? " (" + contactParts.join(" | ") + ")" : "";

  var paragraph =
    "[Support Ticket #" + ticketId + " • Status: " + status + " • " + tsFormatted + "]\n" +
    "From: " + userName + contactStr + "\n" +
    "Subject: " + subject + "\n" +
    "Concern: " + concern;

  sheet.setHiddenGridlines(true);
  var lastRow = sheet.getLastRow();
  var targetRow = -1;
  var marker = "[Support Ticket #" + ticketId + " ";
  if (lastRow > 0) {
    var vals = sheet.getRange(1, 1, lastRow, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0] || "").indexOf(marker) === 0) {
        targetRow = i + 1;
        break;
      }
    }
  }

  var actionResult = "updated";
  if (targetRow === -1) {
    actionResult = "appended";
    targetRow = lastRow === 0 ? 1 : lastRow + 2; // Blank spacing row between entries
  }

  var cell = sheet.getRange(targetRow, 1);
  cell.setValue(paragraph);
  cell.setWrap(true);
  cell.setBorder(false, false, false, false, false, false);
  cell.setFontFamily("Arial");
  cell.setFontSize(11);
  cell.setFontColor("#1F2937");
  cell.setVerticalAlignment("top");

  return jsonResponse({
    status: "success",
    sheetName: sheet.getName(),
    action: actionResult,
    ticketId: ticketId,
    row: targetRow
  }, 200);
}

/* ============================================================================
 * SHEET TAB HELPERS & ONE-CLICK SETUP
 * ============================================================================ */

/**
 * Ensures all 7 required tabs exist:
 *   1. "Users" (or existing Firebase_UID + Email tab)
 *   2. "sponsors details"
 *   3. "Ticketing & bookings"
 *   4. "Community Sessions"
 *   5. "Revenue & Finance"
 *   6. "Notifications" (Word/paragraph document style, hidden gridlines)
 *   7. "Support Centre" (Word/paragraph document style, hidden gridlines)
 */
function ensureAllSheetsExist(ss) {
  var usersSheet = getTargetUsersSheet(ss);
  var sponsorsSheet = getOrCreateNamedSheet(ss, SPONSORS_SHEET_NAME, SPONSORS_HEADERS);
  var bookingsSheet = getOrCreateNamedSheet(ss, BOOKINGS_SHEET_NAME, BOOKINGS_HEADERS);
  var sessionsSheet = getOrCreateNamedSheet(ss, COMMUNITY_SESSIONS_SHEET_NAME, COMMUNITY_SESSIONS_HEADERS);
  var financeSheet = getOrCreateNamedSheet(ss, FINANCE_SHEET_NAME, FINANCE_HEADERS);
  var notificationsSheet = getOrCreateNotificationsDocSheet(ss);
  var supportSheet = getOrCreateSupportDocSheet(ss);
  return [
    usersSheet.getName(),
    sponsorsSheet.getName(),
    bookingsSheet.getName(),
    sessionsSheet.getName(),
    financeSheet.getName(),
    notificationsSheet.getName(),
    supportSheet.getName()
  ];
}

/**
 * Standalone setup helper — Admin can run directly from the Apps Script editor
 * (Run -> setupSheets) to immediately create & format all 3 tabs.
 */
function setupSheets() {
  var ss = getTargetSpreadsheet();
  var tabs = ensureAllSheetsExist(ss);
  Logger.log("Verified/created tabs in " + ss.getId() + ": " + tabs.join(", "));
  return tabs;
}

function getOrCreateNamedSheet(ss, sheetName, headers) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    initSheetHeaders(sheet, headers);
    return sheet;
  }
  if (sheet.getLastRow() === 0) {
    initSheetHeaders(sheet, headers);
  }
  return sheet;
}

function getTargetUsersSheet(ss) {
  var sheets = ss.getSheets();

  // 1. Find any existing tab whose Row 1 starts with Firebase_UID / UID and Email
  for (var i = 0; i < sheets.length; i++) {
    var candidate = sheets[i];
    if (candidate.getLastRow() >= 1) {
      var headerRow = candidate.getRange(1, 1, 1, Math.max(9, candidate.getLastColumn())).getValues()[0];
      var colA = String(headerRow[0] || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
      var colB = String(headerRow[1] || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
      if ((colA === "firebaseuid" || colA === "uid") && colB === "email") {
        return candidate;
      }
    }
  }

  // 2. Fallback to named "Users" tab if present
  var named = ss.getSheetByName(DEFAULT_SHEET_NAME);
  if (named) {
    if (named.getLastRow() === 0) {
      initSheetHeaders(named, HEADERS);
    }
    return named;
  }

  // 3. Fallback to first tab if completely empty
  if (sheets.length > 0 && sheets[0].getLastRow() === 0) {
    initSheetHeaders(sheets[0], HEADERS);
    return sheets[0];
  }

  // 4. Otherwise create a new "Users" tab with the exact 9 headers
  var created = ss.insertSheet(DEFAULT_SHEET_NAME);
  initSheetHeaders(created, HEADERS);
  return created;
}

function initSheetHeaders(sheet, headers) {
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground("#1F5A3A");
  headerRange.setFontColor("#FFFFFF");
  headerRange.setFontWeight("bold");
  sheet.setFrozenRows(1);
}

function formatDateValue(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return val.toISOString();
  }
  return String(val);
}

function jsonResponse(obj, statusCode) {
  var output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function setupScriptSecret(secret) {
  var secretToSave = String(secret || "").trim();
  if (!secretToSave || secretToSave === "YOUR_SECRET_HERE") {
    throw new Error("Pass your real shared secret value to setupScriptSecret(secret).");
  }
  var props = PropertiesService.getScriptProperties();
  props.setProperty("APPS_SCRIPT_SHARED_SECRET", secretToSave);
  props.setProperty("APPS_SCRIPT_SECRET", secretToSave);
  Logger.log("Shared secret configured in Script Properties.");
}
