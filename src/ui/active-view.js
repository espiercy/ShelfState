export function renderActiveView({
  activeView,
  isSearchVisible,
  libraryLayout,
  insightsLayout,
  toggleInsightsButton,
  showFormButton,
  toggleSearchButton,
  searchPanel,
}) {
  const isLibraryView = activeView === "library";
  const isInsightsView = activeView === "insights";

  libraryLayout.classList.toggle("hidden", !isLibraryView);
  insightsLayout.classList.toggle("hidden", !isInsightsView);

  toggleInsightsButton.textContent = isInsightsView
    ? "Back to Library"
    : "Reading Insights";

  showFormButton.classList.toggle("hidden", isInsightsView);
  toggleSearchButton.classList.toggle("hidden", isInsightsView);

  searchPanel.classList.toggle("hidden", isInsightsView || !isSearchVisible);
}
