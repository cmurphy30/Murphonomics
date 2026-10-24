# Economic Insights Blog

A modern, professional economic and financial blog built with HTML, CSS, and JavaScript. Features a responsive design with hero banner, featured articles, post filtering, and smooth navigation.

## Project Structure

```
economic-blog/
├── index.html              # Main HTML file
├── css/
│   └── style.css          # Main stylesheet with responsive design
├── js/
│   └── script.js          # JavaScript functionality
└── assets/
    └── images/            # Directory for blog images (placeholder added)
```

## Features

- **Responsive Design**: Mobile-first approach with breakpoints for tablets and desktops
- **Hero Banner**: Eye-catching header section with background image and overlay
- **Navigation**: Sticky navbar with hamburger menu for mobile devices
- **Featured Post Section**: Highlighted article display
- **Post Grid**: Dynamic posts with category filtering (Stocks, Crypto, Policy)
- **Filter System**: Sort posts by category with smooth transitions
- **Smooth Scrolling**: Navigation links with smooth scroll behavior
- **Analysis Section**: Three-column layout highlighting key blog topics
- **Footer**: Multi-column footer with links and copyright
- **Professional Colors**: 
  - Primary: Navy Blue (#1a365d)
  - Secondary: Medium Blue (#2c5aa0)
  - Accent: Gold (#d4af37)

## Getting Started

### Prerequisites
- A modern web browser (Chrome, Firefox, Safari, Edge)
- A text editor or IDE for customization
- A web server (for local development) or hosting platform

### Installation

1. Navigate to the project folder:
```bash
cd economic-blog
```

2. Open `index.html` in your web browser or serve it locally:
```bash
# Using Python 3
python -m http.server 8000

# Using Python 2
python -m SimpleHTTPServer 8000

# Using Node.js (with http-server installed)
npx http-server
```

3. Visit `http://localhost:8000` in your browser

## Customization Guide

### Update Site Title and Tagline
Edit [index.html](index.html#L35-L38):
```html
<h1>Your Blog Title</h1>
<p class="tagline">Your Tagline Here</p>
```

### Add Hero Image
Replace the placeholder image path in [index.html](index.html#L57):
```html
<img src="assets/images/your-image.jpg" alt="Description">
```

### Add Blog Posts
Duplicate post cards in [index.html](index.html#L135-L175) and update:
- Category (data-category attribute)
- Title
- Description
- Date
- Link

### Modify Colors
Edit CSS variables in [css/style.css](css/style.css#L9-L20):
```css
:root {
    --primary-color: #1a365d;
    --secondary-color: #2c5aa0;
    --accent-color: #d4af37;
    /* ... more colors */
}
```

### Update Navigation Links
Modify [index.html](index.html#L36-L43) navigation menu:
```html
<ul class="nav-menu" id="navMenu">
    <li><a href="#section-id">Your Link</a></li>
</ul>
```

### Customize Footer
Edit footer content in [index.html](index.html#L178-L200)

## Key JavaScript Features

### Filter System
The filter buttons dynamically show/hide posts based on selected categories. Posts are tagged with `data-category` attributes.

### Hamburger Menu
Mobile navigation automatically appears on screens smaller than 768px and toggles with the hamburger icon.

### Smooth Scrolling
Internal links (href starting with #) automatically scroll smoothly to target sections.

### Navigation Highlighting
The active navigation link is highlighted based on scroll position.

### Intersection Observer
Posts animate in as they scroll into view for a polished effect.

## Content Categories

The blog includes posts for these categories:
- **Stocks**: Equity market analysis and updates
- **Crypto**: Cryptocurrency and digital asset coverage
- **Policy**: Economic policy and regulation news

Add new categories by:
1. Creating new post cards with appropriate `data-category`
2. Adding corresponding filter buttons
3. Updating the CSS styling if needed

## Browser Support

- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions
- Mobile browsers: iOS Safari 12+, Chrome Mobile

## Performance Tips

1. **Optimize Images**: Compress hero and post images to reduce load time
2. **Lazy Loading**: Consider adding lazy loading for images below the fold
3. **Minification**: Minify CSS and JavaScript for production
4. **Caching**: Set appropriate cache headers on your web server

## Deployment

### Static Hosting Options
- **Netlify**: Drag and drop the folder or connect GitHub
- **Vercel**: Similar to Netlify, great for static sites
- **GitHub Pages**: Host from your GitHub repository
- **Firebase Hosting**: Free tier available
- **AWS S3 + CloudFront**: Enterprise-grade solution

### Basic Deployment Steps
1. Ensure all images are in `assets/images/` folder
2. Test the site locally thoroughly
3. Upload all files to your hosting platform
4. Update domain settings if needed

## Customization Examples

### Change Hero Section Text
[index.html](index.html#L48-L50)

### Add More Analysis Cards
Copy the `.analysis-card` div in [index.html](index.html#L156-L170)

### Modify Responsive Breakpoints
Edit media queries in [css/style.css](css/style.css#L378-L440)

## Troubleshooting

**Images not loading:**
- Verify file paths are correct
- Ensure image files are in `assets/images/` folder
- Use absolute paths or correct relative paths

**Menu not working on mobile:**
- Ensure JavaScript is enabled
- Check browser console for errors
- Verify screen width is below 768px

**Styling issues:**
- Clear browser cache
- Verify CSS file is linked correctly
- Check for conflicting CSS rules

## License

This project is open source and available for personal and commercial use.

## Support

For issues or questions about customization:
1. Check the browser console for JavaScript errors
2. Validate HTML using W3C Validator
3. Review CSS for syntax errors
4. Test on different browsers

## Future Enhancements

Consider adding:
- Search functionality
- Dark mode toggle
- Comment system
- Email subscription form
- Social media integration
- Blog post archive by date
- Related posts recommendations
- Analytics integration

---

Built with HTML5, CSS3, and vanilla JavaScript. No frameworks or dependencies required.

## Economy weights

The homepage 3D cloud grows a lobe for each of its 11 arms. How big each lobe is comes from that month's economic write-up.

**How they are generated.** `netlify/functions/economy-weights.js` (GET only). The first homepage visit of a month asks it for weights. If none are saved for the month yet, it reads that month's saved summary (`summary-YYYY-MM` in the `summaries` store, read-only) and asks Claude to score how central each variable was to the write-up. It validates the answer (all 11 keys, numbers clamped to 0–1, at most 3 valid drivers, caption ≤140 characters), saves it, and returns it. Every later visit that month gets the same saved copy. If there is no summary yet it returns 404 and the page uses its built-in defaults. If Claude's answer is invalid it returns 502 and saves nothing.

**Store.** Netlify Blobs store `economy-weights`, key `weights-YYYY-MM` (UTC month). It never writes to the `summaries` store, because Market Updates lists everything in that store.

**Schema.**

```json
{
  "weights": {
    "inflation": 0.8, "wages": 0.3, "participation": 0.15, "gdp": 0.4,
    "debt_service": 0.1, "credit_spreads": 0.3, "cape": 0.15, "dxy": 0.4,
    "real_yield": 0.5, "yield_curve": 0.6, "fed_funds": 0.95
  },
  "drivers": ["fed_funds", "inflation"],
  "caption": "One sentence, at most 140 characters, about what is driving the economy this month.",
  "month": "October 2026",
  "generatedAt": "2026-10-24T18:00:00.000Z"
}
```

**Regenerate for the current month.** In the Netlify dashboard open Blobs → `economy-weights`, delete the `weights-YYYY-MM` key for this month, then load the homepage. Visitors' browsers keep their copy until the month ends, so they won't see the new weights until next month unless they clear site data.

## Homepage 3D economy: modes and debugging

**Views.** The Economy section on `index.html` shows the same 11 arms (`.arm`, one per chart) in one of two layouts:

- **3D (default on desktop):** a WebGL point cloud (`js/economy-gl.js`) with floating labels. Hover, focus or tap a label to unfurl its chart panel.
- **List:** a vertical accordion of the same arms. It is used on screens 768px wide or less (with a small decorative cloud above it) and whenever 3D is unavailable.

**`no-3d` mode.** `#economy` gets the class `no-3d` when WebGL can't be created, when `EconomyGL` fails to load, or when the 3D layer throws an error at any point (the cloud is torn down and the page switches to the list without reloading). In `no-3d` mode the canvas is hidden and the note "Interactive 3D view needs WebGL. Open the full dashboard" links to `dashboard.html`. Charts, the summary and the rest of the page are unaffected. To try it, disable WebGL in the browser (for Chrome, start it with `--disable-webgl`).

**Reduced motion.** With `prefers-reduced-motion`, the cloud doesn't autorotate or breathe, the live-data motion layer is off, weight changes ease in over about 150ms, and the About section and panels appear without animation.

**`?debug=weights`.** Open `index.html?debug=weights` to show a small fixed panel with one slider per arm (0–1) and a "log JSON" button that prints the current weights to the browser console. Sliders call `Economy.setWeights()`, so the cloud morphs live. Nothing is shown without the parameter, and nothing is saved.

**Console API.** `Economy.setWeights({ fed_funds: 0.9 })` and `Economy.setMotion({ gdp: 0.4 })` accept any subset of the 11 arm keys; values are clamped to 0–1 and unknown keys are ignored.
