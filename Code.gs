/**
 * =========================================================================
 * HIVE CITY - BACKEND FOR GOOGLE APPS SCRIPT (Google Sheets)
 * =========================================================================
 * 1. Open your Google Sheet.
 * 2. Click: Extensions -> Apps Script.
 * 3. Delete everything in the editor, paste this entire file, and click Save.
 * 4. IMPORTANT: Click Deploy -> Manage deployments -> Edit (pencil) ->
 *    Select "New version" -> Click Deploy.
 * =========================================================================
 */

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Users");
  
  // If the sheet does not exist yet, create it with column headers
  if (!sheet) {
    sheet = ss.insertSheet("Users");
    sheet.appendRow(["ID", "Name", "Email", "Mobile", "Password", "CreatedAt"]);
    sheet.getRange(1, 1, 1, 6).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return createJsonResponse({ success: false, message: "Server is busy. Please try again." });
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({ success: false, message: "No data received in request." });
    }

    var data = JSON.parse(e.postData.contents);
    var sheet = getSheet();
    var action = (data.action || "").toString().toLowerCase().trim();

    // ---------------------------------------------------------------------
    // 1. REGISTER (SIGN UP)
    // Directly saves user & password into the sheet without extra checks
    // ---------------------------------------------------------------------
    if (action === "register") {
      var name = (data.name || "").toString().trim();
      var email = (data.email || "").toString().trim().toLowerCase();
      var mobile = (data.mobile || "").toString().trim();
      var password = (data.password || "").toString();

      if (!email || !password) {
        return createJsonResponse({ success: false, message: "Email and password are required." });
      }

      var id = Utilities.getUuid();
      var createdAt = new Date().toLocaleString();

      // Append row directly into Google Sheet
      sheet.appendRow([id, name, email, mobile, password, createdAt]);

      return createJsonResponse({
        success: true,
        message: "Account created successfully! Please sign in."
      });
    }

    // ---------------------------------------------------------------------
    // 2. LOGIN (SIGN IN)
    // Checks email or mobile, then verifies password against the sheet
    // ---------------------------------------------------------------------
    if (action === "login") {
      var identifier = (data.identifier || "").toString().trim().toLowerCase();
      var inputPassword = (data.password || "").toString();

      if (!identifier || !inputPassword) {
        return createJsonResponse({ success: false, message: "Please enter your email/mobile and password." });
      }

      var rows = sheet.getDataRange().getValues();
      var matchedUser = null;

      // Normalize input mobile number (digits only) in case user logged in with phone
      var inputDigits = identifier.replace(/\D/g, "");
      if (inputDigits.length === 12 && inputDigits.indexOf("91") === 0) {
        inputDigits = inputDigits.substring(2);
      }

      // Loop through all rows in sheet (Row index 0 is header)
      for (var i = 1; i < rows.length; i++) {
        var rowName = (rows[i][1] || "").toString().trim();
        var rowEmail = (rows[i][2] || "").toString().trim().toLowerCase();
        var rowMobile = (rows[i][3] || "").toString().trim();
        var rowPassword = (rows[i][4] || "").toString();

        var rowMobileDigits = rowMobile.replace(/\D/g, "");
        if (rowMobileDigits.length === 12 && rowMobileDigits.indexOf("91") === 0) {
          rowMobileDigits = rowMobileDigits.substring(2);
        }

        var isEmailMatch = (identifier === rowEmail);
        var isMobileMatch = (inputDigits !== "" && inputDigits === rowMobileDigits);

        if (isEmailMatch || isMobileMatch) {
          // Verify password
          if (rowPassword === inputPassword) {
            matchedUser = {
              name: rowName,
              email: rowEmail,
              mobile: rowMobile
            };
            break;
          }
        }
      }

      if (matchedUser) {
        return createJsonResponse({
          success: true,
          user: matchedUser
        });
      } else {
        return createJsonResponse({
          success: false,
          message: "Invalid email/mobile or password."
        });
      }
    }

    return createJsonResponse({ success: false, message: "Unknown action: " + action });

  } catch (err) {
    return createJsonResponse({ success: false, message: err.message || err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  return createJsonResponse({ success: true, message: "HIVE CITY API is online and working!" });
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
