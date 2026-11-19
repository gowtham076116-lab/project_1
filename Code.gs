/**
 * HIVE CITY - Google Apps Script Backend (Code.gs)
 * Paste this in your Google Apps Script editor (https://script.google.com)
 * linked to your Google Sheet.
 */

// 1. Enter your Google Sheet ID or leave as ActiveSpreadsheet if container-bound
function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Users");
  if (!sheet) {
    sheet = ss.insertSheet("Users");
    // Create headers if new sheet
    sheet.appendRow(["ID", "Name", "Email", "Mobile", "Password", "CreatedAt"]);
    sheet.getRange(1, 1, 1, 6).setFontWeight("bold");
  }
  return sheet;
}

// Simple and reliable SHA-256 hash (or store as plain text if preferred)
function hashPassword(password) {
  if (!password) return "";
  var rawBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(password), Utilities.Charset.UTF_8);
  var hash = "";
  for (var i = 0; i < rawBytes.length; i++) {
    var byteVal = rawBytes[i];
    if (byteVal < 0) byteVal += 256;
    var hex = byteVal.toString(16);
    if (hex.length === 1) hex = "0" + hex;
    hash += hex;
  }
  return hash;
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return jsonResponse({ success: false, message: "Server is busy. Please try again." });
  }

  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else {
      return jsonResponse({ success: false, message: "Empty request body" });
    }

    var sheet = getSheet();
    var action = data.action;

    // ==========================================
    // ACTION: REGISTER
    // "user creating the password do not check in database leave it and store in excel"
    // ==========================================
    if (action === "register") {
      var name = (data.name || "").toString().trim();
      var email = (data.email || "").toString().trim().toLowerCase();
      var mobile = (data.mobile || "").toString().trim();
      var rawPassword = (data.password || "").toString();

      if (!email || !rawPassword) {
        return jsonResponse({ success: false, message: "Email and password are required." });
      }

      var hashedPassword = hashPassword(rawPassword);
      var id = Utilities.getUuid();
      var createdAt = new Date().toISOString();

      // Directly store in Google Sheet (Excel) without blocking or duplicate check
      sheet.appendRow([id, name, email, mobile, hashedPassword, createdAt]);

      return jsonResponse({
        success: true,
        message: "Account created successfully."
      });
    }

    // ==========================================
    // ACTION: LOGIN
    // "whethere user clicking sign in option then check the mail and password"
    // ==========================================
    if (action === "login") {
      var identifier = (data.identifier || "").toString().trim().toLowerCase();
      var rawPassword = (data.password || "").toString();

      if (!identifier || !rawPassword) {
        return jsonResponse({ success: false, message: "Identifier and password required." });
      }

      var hashedPassword = hashPassword(rawPassword);
      var rows = sheet.getDataRange().getValues();

      // Header is row 0: [ID, Name, Email, Mobile, Password, CreatedAt]
      var matchedUser = null;

      for (var i = 1; i < rows.length; i++) {
        var rowEmail = (rows[i][2] || "").toString().trim().toLowerCase();
        var rowMobile = (rows[i][3] || "").toString().trim();
        var rowPass = (rows[i][4] || "").toString().trim();

        // Check if identifier matches email or mobile
        var isEmailMatch = (identifier === rowEmail);
        var isMobileMatch = (identifier.replace(/\D/g, "") === rowMobile.replace(/\D/g, ""));

        if ((isEmailMatch || isMobileMatch)) {
          // Check password (supports hashed and plain text if migrated)
          if (rowPass === hashedPassword || rowPass === rawPassword) {
            matchedUser = {
              name: rows[i][1],
              email: rowEmail,
              mobile: rowMobile
            };
            break;
          }
        }
      }

      if (matchedUser) {
        return jsonResponse({
          success: true,
          user: matchedUser
        });
      } else {
        return jsonResponse({
          success: false,
          message: "Invalid email/mobile or password."
        });
      }
    }

    return jsonResponse({ success: false, message: "Unknown action: " + action });

  } catch (error) {
    return jsonResponse({ success: false, message: error.message || error.toString() });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  return jsonResponse({ success: true, message: "HIVE CITY API is active." });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
