/**
 * Reusable HTML message page generator
 * Creates styled, centered message pages that respect system light/dark mode
 */

export interface MessagePageOptions {
	title: string
	message: string
	subtitle?: string
}

/**
 * Renders a styled HTML message page
 * @param options - Page title, message, and optional subtitle
 * @returns Complete HTML document string
 */
export function renderMessagePage(options: MessagePageOptions): string {
	const { title, message, subtitle } = options

	const subtitleHtml = subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ''

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background-color: #e0e0e0;
      color: #333;
    }

    .container {
      text-align: center;
      max-width: 500px;
      background-color: #f5f5f5;
      padding: 2.5rem 3rem;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    h1 {
      font-size: 1.75rem;
      font-weight: 600;
      margin-bottom: 1rem;
      color: #111;
    }

    .message {
      font-size: 1rem;
      line-height: 1.6;
      color: #555;
    }

    .subtitle {
      font-size: 0.875rem;
      color: #888;
      margin-top: 1.5rem;
    }

    @media (prefers-color-scheme: dark) {
      body {
        background-color: #111;
        color: #e5e5e5;
      }

      .container {
        background-color: #222;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      }

      h1 {
        color: #f5f5f5;
      }

      .message {
        color: #b5b5b5;
      }

      .subtitle {
        color: #777;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${escapeHtml(title)}</h1>
    <p class="message">${escapeHtml(message)}</p>
    ${subtitleHtml}
  </div>
</body>
</html>`
}

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;')
}
