export function downloadLibraryExport(exportData) {
  const exportJson = JSON.stringify(exportData, null, 2);
  const exportBlob = new Blob([exportJson], {
    type: "application/json",
  });

  const downloadUrl = URL.createObjectURL(exportBlob);
  const downloadLink = document.createElement("a");

  downloadLink.href = downloadUrl;
  downloadLink.download = `shelfstate-backup-${exportData.exportedAt.slice(0, 10)}.json`;

  document.body.append(downloadLink);
  downloadLink.click();
  downloadLink.remove();

  URL.revokeObjectURL(downloadUrl);
}
