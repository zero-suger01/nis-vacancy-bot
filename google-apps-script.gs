// NIS-Vacancy -> Google Sheets bridge.
// Paste this into your spreadsheet: Extensions -> Apps Script, replace the
// existing code with this file, then Deploy -> Manage deployments -> edit
// (pencil icon) -> Version: New version -> Deploy. The URL stays the same.

function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "Sana",
      "F.I.Sh",
      "Jins",
      "Yosh",
      "Manzil",
      "Telefon",
      "Ma'lumoti",
      "Mutaxassislik",
      "Sertifikatlar",
      "Tajriba",
      "Filial",
      "CV",
      "Telegram",
    ]);
  }
  sheet.appendRow([
    new Date(),
    data.fullName,
    data.gender,
    data.age,
    data.address,
    data.phone,
    data.education,
    data.specialty,
    data.certificates,
    data.experience,
    data.branch,
    data.cv,
    data.telegram,
  ]);
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true })
  ).setMimeType(ContentService.MimeType.JSON);
}
