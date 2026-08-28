export function renderActiveView({
  activeView,
  libraryLayout,
  insightsLayout,
  toggleInsightsButton,
  showFormButton,
  toggleSearchButton,
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
}
