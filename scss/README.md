# Stylesheet Source

Sass is the source of truth for the public site styles.

- `scss/styles.scss` compiles to `css/styles.css` and is used by all HTML pages.

Use:

```bash
npm run build:css
```

During active styling work:

```bash
npm run watch:css
```

Keep HTML free of page-level inline `<style>` blocks; add styles in SCSS and compile them to `css/`.
