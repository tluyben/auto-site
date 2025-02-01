const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const Groq = require("groq-sdk");
const path = require("path");
const { promisify } = require("util");

const app = express();
const port = process.env.PORT || 3000;

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// see Groq playground for available models; https://console.groq.com/docs/models
const groqModel = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

// Promisify database operations
function getDb() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database("articles.db", (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

// Database initialization
async function initializeDb() {
  const db = await getDb();

  // Promisify db.run and db.all
  db.runAsync = promisify(db.run).bind(db);
  db.allAsync = promisify(db.all).bind(db);
  db.getAsync = promisify(db.get).bind(db);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      created DATETIME NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_category ON articles(category);
    CREATE INDEX IF NOT EXISTS idx_slug ON articles(slug);
  `);

  return db;
}

// Helper function to get distinct categories
async function getCategories(db) {
  return await db.allAsync(
    "SELECT DISTINCT category FROM articles GROUP BY LOWER(category) ORDER BY category"
  );
}

// Helper function to generate navigation HTML
async function generateNavigation(db) {
  const categories = await getCategories(db);
  return `
    <div style="
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 1px solid #eee;
      font-family: Arial, sans-serif;
    ">
      <a href="/" style="
        display: inline-block;
        margin-bottom: 1rem;
        color: #0066cc;
        text-decoration: none;
        font-weight: bold;
      ">← Back to Home</a>
      <div style="color: #333; margin-bottom: 0.5rem;">Categories:</div>
      <div style="
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
      ">
        ${categories
          .map(
            (cat) => `
          <a href="/category/${cat.category}" style="
            color: #0066cc;
            text-decoration: none;
            padding: 0.3rem 0.8rem;
            background: #f5f5f5;
            border-radius: 15px;
            font-size: 0.9rem;
          ">${cat.category.charAt(0).toUpperCase() + cat.category.slice(1)}</a>
        `
          )
          .join("")}
      </div>
    </div>
  `;
}

// Helper function to render categories list
function renderCategoriesList(categories) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Article Categories</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
          h1 { color: #333; }
          .categories { list-style: none; padding: 0; }
          .categories li { margin: 1rem 0; }
          .categories a { color: #0066cc; text-decoration: none; font-size: 1.2rem; }
          .categories a:hover { text-decoration: underline; }
          .search-container { margin: 2rem 0; }
          .search-form { display: flex; gap: 10px; }
          .search-input {
            flex: 1;
            padding: 10px 15px;
            font-size: 16px;
            border: 2px solid #ddd;
            border-radius: 4px;
            outline: none;
          }
          .search-input:focus { border-color: #0066cc; }
          .search-button {
            padding: 10px 20px;
            font-size: 16px;
            background-color: #0066cc;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          }
          .search-button:hover { background-color: #0052a3; }
        </style>
      </head>
      <body>
        <div class="search-container">
          <form id="searchForm" onsubmit="handleSearch(event)" class="search-form">
            <input 
              type="text" 
              id="searchInput" 
              placeholder="What would you like to learn about?" 
              class="search-input"
              required
            >
            <button type="submit" class="search-button">Search</button>
          </form>
        </div>
        <h1>Article Categories</h1>
        <script>
          function handleSearch(event) {
            event.preventDefault();
            const searchInput = document.getElementById('searchInput').value;
            
            // Convert to slug: lowercase, replace spaces with hyphens, remove special characters
            const slug = searchInput
                .toLowerCase()
                .trim()
                .replace(/[^\\w\\s-]/g, '')    // Remove special characters
                .replace(/\\s+/g, '-')        // Replace spaces with hyphens
                .replace(/-+/g, '-');        // Replace multiple hyphens with single hyphen
                
            // Redirect to the slug URL
            window.location.href = '/' + slug;
          }
        </script>
        <ul class="categories">
          ${categories
            .map(
              (cat) =>
                `<li><a href="/category/${cat.category}">${cat.category.charAt(0).toUpperCase() + cat.category.slice(1)}</a></li>`
            )
            .join("")}
        </ul>
      </body>
    </html>
  `;
}

// Helper function to render category articles list
async function renderCategoryArticles(db, category, articles) {
  const navigation = await generateNavigation(db);
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Articles in ${category}</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
          h1 { color: #333; }
          .articles { list-style: none; padding: 0; }
          .articles li { margin: 1rem 0; border-bottom: 1px solid #eee; padding-bottom: 1rem; }
          .articles a { color: #0066cc; text-decoration: none; font-size: 1.2rem; }
          .articles a:hover { text-decoration: underline; }
          .date { color: #666; font-size: 0.9rem; }
        </style>
      </head>
      <body>
        <h1>Articles in ${category.charAt(0).toUpperCase() + category.slice(1)}</h1>
        <ul class="articles">
          ${articles
            .map(
              (article) => `
            <li>
              <div class="date">${new Date(
                article.created
              ).toLocaleDateString()}</div>
              <a href="/${article.slug}">${article.title.charAt(0).toUpperCase() + article.title.slice(1)}</a>
            </li>
          `
            )
            .join("")}
        </ul>
        ${navigation}
      </body>
    </html>
  `;
}

// Initialize database and start server
async function start() {
  const db = await initializeDb();

  // Home page route
  app.get("/", async (req, res) => {
    const categories = await getCategories(db);
    res.send(renderCategoriesList(categories));
  });

  // Category listing route
  app.get("/category/:category", async (req, res) => {
    const { category } = req.params;
    const articles = await db.allAsync(
      "SELECT title, created, slug FROM articles WHERE LOWER(category) = LOWER(?) ORDER BY created DESC",
      [category]
    );
    res.send(await renderCategoryArticles(db, category, articles));
  });

  // Article route
  app.get("/:slug", async (req, res) => {
    const { slug } = req.params;

    // Check if article exists in database
    const existingArticle = await db.getAsync(
      "SELECT * FROM articles WHERE slug = ?",
      [slug]
    );
    if (existingArticle) {
      // Insert navigation before </body> if it exists, otherwise append to end
      const navigation = await generateNavigation(db);
      const body = existingArticle.body;
      const modifiedBody = body.includes("</body>")
        ? body.replace("</body>", `${navigation}</body>`)
        : body + navigation;

      res.send(modifiedBody);
      return;
    }

    // Generate new article using Groq
    let retries = 0;
    let article;

    while (retries < 2) {
      try {
        const completion = await groq.chat.completions.create({
          messages: [
            {
              role: "user",
              content: `You are an expert writing about any topic, with that in mind, generate a static webpage telling us in depth about '${slug.replace(
                "-",
                " "
              )}' \n\nInstruction; generate JSON with {category: , title:, body: } , for the BODY , generate the COMPLETE HTML/CSS into one file and make it look beautiful with colors related to the category. For the category, if the topic fits any of these existing categories: ${(await getCategories(db)).map(c => c.category).join(', ')}, use that category. If it doesn't fit any existing category, suggest a new appropriate category. DO NOT deliver anything ELSE!`,
            },
          ],
          model: groqModel,
          temperature: 0.5,
        });

        try {
          const rawContent = completion.choices[0].message.content;

          // First try to extract content from markdown code blocks if they exist
          const codeBlockMatch = rawContent.match(
            /```(?:json)?\s*([\s\S]*?)```/
          );

          // Use content between code blocks if found, otherwise use raw content
          let contentToParse = codeBlockMatch
            ? codeBlockMatch[1].trim()
            : rawContent;

          contentToParse = contentToParse.replace(/\n/g, " ");

          article = JSON.parse(contentToParse);
        } catch (error) {
          console.error("Failed to parse JSON content:", error);
        }

        // Validate JSON structure
        if (!article.category || !article.title || !article.body) {
          throw new Error("Invalid JSON structure");
        }

        break;
      } catch (error) {
        console.error(`Attempt ${retries + 1} failed:`, error);
        retries++;
      }
    }

    if (!article) {
      const categories = await getCategories(db);
      const notFoundHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>404 - Page Not Found</title>
            <style>
              body { font-family: Arial, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
              .error-header {
                background: #ffebee;
                border: 1px solid #ffcdd2;
                border-radius: 4px;
                padding: 1.5rem;
                margin: 2rem 0;
                text-align: center;
              }
              .error-header h1 {
                color: #c62828;
                margin: 0 0 0.5rem 0;
                font-size: 2rem;
              }
              .error-header p {
                color: #b71c1c;
                margin: 0;
                font-size: 1.1rem;
              }
              .divider {
                border-top: 1px solid #eee;
                margin: 2rem 0;
              }
              .homepage-content {
                opacity: 0.9;
              }
            </style>
          </head>
          <body>
            <div class="error-header">
              <h1>404 - Page Not Found</h1>
              <p>The page you're looking for could not be generated.</p>
            </div>
            <div class="divider"></div>
            <div class="homepage-content">
              ${renderCategoriesList(categories)}
            </div>
          </body>
        </html>
      `;
      res.status(404).send(notFoundHtml);
      return;
    }

    // Check if category exists (case-insensitive) and get its exact casing
    const existingCategory = await db.getAsync(
      "SELECT category FROM articles WHERE LOWER(category) = LOWER(?) LIMIT 1",
      [article.category]
    );

    // Use existing category casing if found, otherwise use the new category
    const categoryToUse = existingCategory ? existingCategory.category : article.category;

    // Store the new article
    await db.runAsync(
      "INSERT INTO articles (category, created, title, body, slug) VALUES (?, ?, ?, ?, ?)",
      [
        categoryToUse,
        new Date().toISOString(),
        article.title,
        article.body,
        slug,
      ]
    );

    // Insert navigation before </body> if it exists, otherwise append to end
    const navigation = await generateNavigation(db);
    const body = article.body;
    const modifiedBody = body.includes("</body>")
      ? body.replace("</body>", `${navigation}</body>`)
      : body + navigation;

    res.send(modifiedBody);
  });

  // Start the server
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

// Handle any errors during startup
start().catch(console.error);
