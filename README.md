# IconFont Compiler
Compile .iconfont file to icon fonts(.svg, .ttf, .eot, .woff, .woff2, .css, .html)

## How to use

1. Create an `icon.iconfont` file:
```xml
<?xml version="1.0" encoding="utf-8"?>
<iconfont fontName="" startUnicode="59907" classNamePrefix="my-icon">
	<svg src="*.svg"></svg>
</iconfont>
```
Then copy all the `.svg` icons to the same directory of `icon.iconfont`

You can add some attributes to `<svg>` nodes:
- `name`: The name of icon
- `unicode`: The unicode string of icon
- `class`: The css class name of icon
- `title`: Readable title of icon

For example:
```xml
<svg name="warning" unicode="⚠" class="warning" viewBox="0 0 1034 1024">
	<path d="M1011.982 842.518 606.673 140.565c-49.575-85.822-130.595-85.822-180.157 0L21.205 842.518c-49.562 85.91-9.015 155.99 90.04 155.99l810.693 0C1020.997 998.507 1061.502 928.423 1011.982 842.518zM460.924 339.737c14.565-15.747 33.082-23.622 55.665-23.622 22.595 0 41.095 7.792 55.675 23.307 14.485 15.55 21.725 34.997 21.725 58.382 0 20.12-30.235 168.07-40.32 275.704l-72.825 0c-8.845-107.635-41.652-255.584-41.652-275.704C439.194 374.774 446.446 355.407 460.924 339.737zM571.244 851.538c-15.32 14.92-33.55 22.355-54.65 22.355-21.095 0-39.33-7.435-54.647-22.355-15.275-14.885-22.867-32.915-22.867-54.09 0-21.065 7.592-39.29 22.867-54.565 15.317-15.28 33.552-22.92 54.647-22.92 21.1 0 39.33 7.64 54.65 22.92 15.265 15.275 22.875 33.5 22.875 54.565C594.119 818.623 586.509 836.653 571.244 851.538z"></path>
</svg>
```

2. Generate all files using compiler api
```js
import { compileIconFont } from "iconfont-compiler"
import { readFileSync, writeFileSync } from "fs"

const result = await compileIconFont(readFileSync("icon.iconfont", "utf-8"), "icon.iconfont")
writeFileSync(`./dist/iconfont.svg`, result.svg)
writeFileSync(`./dist/iconfont.ttf`, result.ttf)
writeFileSync(`./dist/iconfont.eot`, result.eot)
writeFileSync(`./dist/iconfont.woff`, result.woff)
writeFileSync(`./dist/iconfont.woff2`, result.woff2)
writeFileSync(`./dist/iconfont.css`, result.css)
writeFileSync(`./dist/iconfont.html`, result.html)
```