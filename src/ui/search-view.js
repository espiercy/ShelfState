export function renderSearchView({
  isSearchVisible,
  showSearchPanel,
  searchActive,
  summaryText,
  searchPanel,
  toggleSearchButton,
  searchSummary,
  clearSearchButton,
}) {
  searchPanel.classList.toggle("hidden", !showSearchPanel);

  toggleSearchButton.textContent = isSearchVisible ? "Hide Search" : "Search";

  searchSummary.textContent = summaryText;
  clearSearchButton.hidden = !searchActive;
}
