import {
  CLASSIFICATION_LABELS,
  SHELF_STATUSES,
  STATUS_LABELS,
} from "../config.js";

export function renderReadingInsights(readingInsights, insights) {
  const statusCards = SHELF_STATUSES.map(
    (status) => `
      <div class="insight-card">
        <span class="insight-value">
          ${insights.booksByStatus[status] ?? 0}
        </span>
        <span class="insight-label">${STATUS_LABELS[status]}</span>
      </div>
    `,
  ).join("");

  readingInsights.innerHTML = `<h2>Reading Insights</h2>
  
<div class="insight-grid">
	<div class="insight-card">
		<span class="insight-value">${insights.totalBooks}</span>
		<span class="insight-label">Books</span>
	</div>
	<div class="insight-card">
		<span class="insight-value">${insights.completedBooks}</span>
		<span class="insight-label">Completed</span>
	</div>	
	<div class="insight-card">
		<span class="insight-value">${insights.currentlyReadingBooks}</span>
		<span class="insight-label">Currently Reading</span>
	</div>		
	<div class="insight-card">
		<span class="insight-value">${insights.pagesRead}</span>
		<span class="insight-label">Pages Read</span>
	</div>		
	<div class="insight-card">
		<span class="insight-value">${insights.pagesRemaining}</span>
		<span class="insight-label">Pages Remaining</span>
	</div>
</div>
<h3>Books by Status</h3>
<div class="insight-grid">
  ${statusCards}
</div>
<h3>Books by Category</h3>
<div id="category-insights" class="insight-grid"></div>

<h3>Books by Bookshelf</h3>
<div id="bookshelf-insights" class="insight-grid"></div>

<h3>Books by Classification</h3>
<div id="classification-insights" class="insight-grid"></div>`;

  const categoryInsights = readingInsights.querySelector("#category-insights");

  const sortedCategories = Object.entries(insights.booksByCategory).sort(
    ([categoryA], [categoryB]) => categoryA.localeCompare(categoryB),
  );

  sortedCategories.forEach(([category, count]) => {
    categoryInsights.appendChild(createInsightCard(count, category));
  });

  const bookshelfInsights = readingInsights.querySelector(
    "#bookshelf-insights",
  );

  insights.booksByBookshelf.forEach((bookshelf) => {
    bookshelfInsights.appendChild(
      createInsightCard(bookshelf.count, bookshelf.name),
    );
  });

  const classificationInsights = readingInsights.querySelector(
    "#classification-insights",
  );

  Object.entries(CLASSIFICATION_LABELS).forEach(([classification, label]) => {
    const count = insights.booksByClassification[classification] ?? 0;

    classificationInsights.appendChild(createInsightCard(count, label));
  });
}

function createInsightCard(valueText, labelText) {
  const card = document.createElement("div");
  card.className = "insight-card";

  const value = document.createElement("span");
  value.className = "insight-value";
  value.textContent = valueText;

  const label = document.createElement("span");
  label.className = "insight-label";
  label.textContent = labelText;

  card.append(value, label);

  return card;
}
