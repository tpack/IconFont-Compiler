import { Readable } from "stream"
import * as svg2ttf from "svg2ttf"
import * as SVGIcons2SVGFontStream from "svgicons2svgfont"
import * as ttf2eot from "ttf2eot"
import * as ttf2woff from "ttf2woff"
import { FileSystem } from "tutils/fileSystem"
import { encodeHTML } from "tutils/html"
import { quoteJSString } from "tutils/js"
import { isGlob } from "tutils/matcher"
import { getDir, getName, resolvePath } from "tutils/path"
import * as wawoff2 from "wawoff2"
import * as xmldoc from "xmldoc"

/**
 * 编译 .iconfont 文件到图标字体文件
 * @param content 要编译的 .iconfont 源文件内容
 * @param path 要编译的 .iconfont 源文件路径，用于解析源文件内的相对地址
 * @param formats 要生成的格式
 * @param options 附加选项
 * @param fs 使用的文件系统，用于解析源文件内的相对地址
 */
export async function compileIconFont(content: string, path: string, formats: ("svgFont" | "ttf" | "eot" | "woff" | "woff2" | "js" | "svg" | "css" | "html")[] = ["eot", "ttf", "woff", "woff2", "css", "html"], options?: IconFontOptions, fs = new FileSystem()) {
	const rootNode = new xmldoc.XmlDocument(content)
	const attrs = rootNode.attr ?? {}
	const result: CompileIconFontResult = {
		icons: [],
		dependencies: [],
		globDependencies: [],
		iconNames: new Set(),
		unicodes: new Set(),
		classNames: new Set(),
		startUnicode: options?.startUnicode ?? (parseNumber(attrs.startUnicode) ?? 0xea01)
	}
	if (rootNode.name === "iconfont") {
		if (rootNode.children) {
			for (const childNode of rootNode.children) {
				if (childNode.name === "svg") {
					const src = childNode.attr?.src
					if (src === undefined) {
						processNode(childNode, path, result)
					} else if (isGlob(src)) {
						const baseDir = getDir(path)
						result.globDependencies.push({ glob: src, cwd: baseDir })
						for (const fullPath of await fs.glob(src, baseDir)) {
							await processFile(fullPath, result, fs)
						}
					} else {
						await processFile(resolvePath(path, "..", src), result, fs)
					}
				}
			}
		}
	} else {
		processNode(rootNode, path, result)
	}
	await generateIconFont(result, formats, {
		fontName: attrs.fontName ?? getName(path, false),
		ascent: parseNumber(attrs.ascent),
		centerHorizontally: parseBoolean(attrs.centerHorizontally),
		descent: parseNumber(attrs.descent),
		fixedWidth: parseBoolean(attrs.fixedWidth),
		fontHeight: parseNumber(attrs.fontHeight),
		fontId: attrs.fontId,
		fontStyle: attrs.fontStyle,
		fontWeight: attrs.fontWeight,
		metadata: attrs.metadata,
		normalize: parseBoolean(attrs.normalize),
		round: parseNumber(attrs.foroundntHeight),
		startUnicode: result.startUnicode,
		classNamePrefix: attrs.classNamePrefix,
		fileName: path,
		...options
	})
	return result
}

function parseBoolean(value: string | undefined) {
	return value === undefined ? undefined : value !== "false"
}

function parseNumber(value: string | undefined) {
	if (value === undefined) {
		return undefined
	}
	if (value.startsWith("0x")) {
		return parseInt(value.slice(2), 16)
	}
	if (value.endsWith("%")) {
		return parseFloat(value) / 100
	}
	return parseFloat(value)
}

/**
 * 编译 .svg 图标文件到图标字体文件
 * @param sources 要编译的所有 .svg 图标文件路径或内容对象
 * @param formats 要生成的格式
 * @param options 附加选项
 * @param fs 使用的文件系统，用于解析源文件内的相对地址
 */
export async function compileIconFontFromSources(sources: (string | { path: string, content?: string } & SVGIcon)[], formats: ("svgFont" | "ttf" | "eot" | "woff" | "woff2" | "js" | "svg" | "css" | "html")[] = ["eot", "ttf", "woff", "woff2", "css", "html"], options?: IconFontOptions, fs = new FileSystem()) {
	const result: CompileIconFontResult = {
		icons: [],
		dependencies: [],
		globDependencies: [],
		iconNames: new Set(),
		unicodes: new Set(),
		classNames: new Set(),
		startUnicode: options?.startUnicode ?? 0xea01
	}
	for (const source of sources) {
		if (typeof source === "string") {
			await processFile(source, result, fs)
		} else {
			result.dependencies.push(source.path)
			const icon = new String(source.content ?? await fs.readText(source.path)) as SVGIcon
			icon.iconName = getUnique(icon.iconName ?? getName(source.path, false), result.iconNames)
			icon.className = getUnique(icon.className ?? icon.iconName, result.classNames)
			if (icon.unicode != undefined) {
				icon.unicode = getUniqueUnicode(icon.unicode, result.unicodes)
			} else {
				icon.unicode = result.startUnicode = getUniqueUnicode(result.startUnicode, result.unicodes)
				icon.autoUnicode = true
			}
			result.icons.push(icon)
		}
	}
	await generateIconFont(result, formats, { ...options, startUnicode: result.startUnicode })
	return result
}

/** 表示生成图标字体的附加选项 */
export interface IconFontOptions {
	/**
	 * 字体名
	 * @default "iconfont"
	 */
	fontName?: string
	/**
	 * 字体 ID
	 * @default this.fontName
	 */
	fontId?: string
	/**
	 * 字体风格（值同 CSS，如 "italic"）
	 * @default ""
	 */
	fontStyle?: string
	/**
	 * 字粗（值同 CSS，如 "normal"）
	 * @default ""
	 */
	fontWeight?: number | string
	/**
	 * 是否创建等宽字体（以最大图标宽度为准）
	 * @default false
	 */
	fixedWidth?: boolean
	/**
	 * 是否垂直居中字体
	 * @default true
	 */
	centerHorizontally?: boolean
	/**
	 * 是否放大图标使所有图标等高（以最大图标高度为准）
	 * @default true
	 */
	normalize?: boolean
	/**
	 * 字体高度
	 * @default 1024
	 */
	fontHeight?: number
	/**
	 * SVG 路径精度
	 * @default 10e12
	 */
	round?: number
	/**
	 * 字体底线（正数）
	 * @default 150
	 */
	descent?: number
	/**
	 * 字体顶线
	 * @default this.fontHeight - this.descent
	 */
	ascent?: number
	/**
	 * 字体元数据（比如版权声明）
	 * @see https://www.w3.org/TR/SVG/struct.html
	 */
	metadata?: undefined
	/**
	 * 获取每个字体元数据的回调函数
	 * @param path SVG 文件路径
	 * @param callback 加载完成的回调函数
	 * @param callback.error 如果存在错误则返回错误对象
	 * @param callback.metadata.path 实际的 SVG 文件路径（如果文件未重命名，应该同 *path*）
	 * @param callback.metadata.name 图标名
	 * @param callback.metadata.unicode 所有 Unicode 字符数组（每项应该是一个单字符）
	 * @param callback.metadata.renamed 是否已移动了 SVG 文件路径
	 * @default require('svgicons2svgfont/src/metadata')(options)
	 */
	metadataProvider?: (path: string, callback: (error: any, metadata: { path: string, name: string, unicode: string[], renamed: boolean }) => void) => void
	/**
	 * 自定义日志函数
	 * @default console.log
	 */
	log?: (message: string) => void
	/**
	 * 自动计算 Unicode 编码的起始值
	 * @default 0xea01
	 */
	startUnicode?: number
	/**
	 * 自动为文件名添加 Unicode 前缀
	 * @default false
	 */
	prependUnicode?: boolean
	/**
	 * 生成的 CSS 类名前缀
	 * @default "icon-"
	 */
	classNamePrefix?: string
	/** TTF 字体的附加选项 */
	ttf?: {
		/** 版权声明 */
		copyright?: string
		/** 描述 */
		description?: string
		/** 文件创建时间（Unix 时间格式；单位：秒） */
		ts?: number
		/** 字体作者主页 */
		url?: string
		/** 版本（x.y） */
		version?: string
	}
	/** 生成的文件名 */
	fileName?: string
	/** 附加的哈希值 */
	hash?: string
}

/** 表示生成图标字体的结果 */
export interface CompileIconFontResult {
	/** 生成的 .svg 字体图标内容 */
	svgFont?: string
	/** 生成的 .eot 字体图标内容 */
	eot?: Buffer
	/** 生成的 .ttf 字体图标内容 */
	ttf?: Buffer
	/** 生成的 .woff 字体图标内容 */
	woff?: Buffer
	/** 生成的 .woff2 字体图标内容 */
	woff2?: Buffer
	/** 生成的 .svg 雪碧图标脚本 */
	js?: string
	/** 生成的 .svg 雪碧图标内容 */
	svg?: string
	/** 生成的 .css 字体样式表 */
	css?: string
	/** 生成的图标预览 */
	html?: string
	/** 生成时依赖的路径，当路径发生变化后需要重新生成 */
	dependencies?: string[]
	/** 生成时依赖的通配符，当新建通配符对应的路径后需要重新生成 */
	globDependencies?: { glob: string, cwd: string }[]
	/** 统计的所有图标 */
	icons: SVGIcon[]
	/** 已使用的图标名 */
	iconNames: Set<string>
	/** 已使用的 Unicode 字符 */
	unicodes: Set<number>
	/** 已使用的 CSS 类名 */
	classNames: Set<string>
	/** 下一次要使用的起始 Unicode 编码 */
	startUnicode: number
}

/** 表示一个 SVG 图标 */
export interface SVGIcon {
	/** 字体名 */
	iconName?: string
	/** Unicode 字符 */
	unicode?: number
	/** 是否自动生成了 Unicode 字符 */
	autoUnicode?: boolean
	/** CSS 类名 */
	className?: string
	/** 可读标题 */
	title?: string
	/** 返回 SVG 源码 */
	toString(): string
}

/** 表示一个 SVG 节点 */
export interface SVGNode {
	/** 节点名 */
	name?: string
	/** 节点属性 */
	attr?: { [prop: string]: string }
	/** 所有子节点 */
	children?: SVGNode[]
	/** 返回节点源码 */
	toString(): string
}

/** 处理一个文件 */
async function processFile(path: string, result: CompileIconFontResult, fs: FileSystem) {
	result.dependencies.push(path)
	const content = await fs.readText(path)
	const rootNode = new xmldoc.XmlDocument(content)
	processNode(rootNode, path, result)
}

/** 处理一个 SVG 节点 */
async function processNode(icon: SVGIcon & SVGNode, path: string, result: CompileIconFontResult) {
	if (icon.name === "svg") {
		icon.iconName = getUnique(icon.attr?.id ?? getName(path, false), result.iconNames)
		icon.className = getUnique(icon.attr?.class ?? icon.iconName, result.classNames)
		if (icon.attr != undefined && icon.attr.unicode != undefined) {
			icon.unicode = getUniqueUnicode(icon.attr.unicode.startsWith("0x") ? parseNumber(icon.attr.unicode) : icon.attr.unicode.codePointAt(0), result.unicodes)
		} else {
			icon.unicode = result.startUnicode = getUniqueUnicode(result.startUnicode, result.unicodes)
			icon.autoUnicode = true
		}
		icon.title = icon.attr?.title ?? icon.iconName
		result.icons.push(icon)
	}
}

function getUnique(content: string, set: Set<string>) {
	if (set.has(content)) {
		for (let i = 2; ; i++) {
			const newContent = content + "-" + i
			if (!set.has(newContent)) {
				content = newContent
				break
			}
		}
	}
	set.add(content)
	return content
}

function getUniqueUnicode(startUnicode: number, set: Set<number>) {
	if (isNaN(startUnicode)) startUnicode = 0xea01
	if (set.has(startUnicode)) {
		while (set.has(startUnicode)) {
			startUnicode++
		}
	}
	set.add(startUnicode)
	return startUnicode
}

/** 生成字体 */
async function generateIconFont(result: CompileIconFontResult, formats: ("svgFont" | "ttf" | "eot" | "woff" | "woff2" | "js" | "svg" | "css" | "html")[], options: IconFontOptions) {
	let svgFont: boolean, eot: boolean, ttf: boolean, woff: boolean, woff2: boolean, js: boolean, svg: boolean, css: boolean, html: boolean
	for (const format of formats) {
		switch (format) {
			case "svgFont":
				svgFont = true
				break
			case "ttf":
				ttf = svgFont = true
				break
			case "eot":
				eot = ttf = svgFont = true
				break
			case "woff":
				woff = ttf = svgFont = true
				break
			case "woff2":
				woff2 = ttf = svgFont = true
				break
			case "js":
				js = svg = true
				break
			case "svg":
				svg = true
				break
			case "css":
				css = true
				break
			case "html":
				html = true
				break
		}
	}
	if (svgFont) {
		result.svgFont = await generateSVGFont(result.icons, options)
	}
	if (ttf) {
		result.ttf = Buffer.from(svg2ttf(result.svgFont, options.ttf).buffer)
	}
	if (eot) {
		result.eot = Buffer.from(ttf2eot(result.ttf).buffer)
	}
	if (woff) {
		result.woff = Buffer.from(ttf2woff(result.ttf, options).buffer)
	}
	if (woff2) {
		result.woff2 = Buffer.from(await wawoff2.compress(result.ttf))
	}
	if (svg) {
		result.svg = generateSVGSprite(result.icons, options)
	}
	if (js) {
		result.js = generateJS(result.svg, options)
	}
	if (css) {
		result.css = generateCSS(result.icons, options)
	}
	if (html) {
		result.html = generateHTML(result.icons, options)
	}
}

/** 生成 SVG 图标 */
function generateSVGFont(icons: SVGIcon[], options: IconFontOptions) {
	options.fontHeight = options.fontHeight ?? 1024
	options.round = options.round ?? 10e12
	options.centerHorizontally = options.centerHorizontally ?? true
	options.normalize = options.normalize ?? true
	options.descent = options.descent ?? 150
	options.log = options.log ?? (() => { })
	// 修复 SVGIcons2SVGFontStream 中当没有图标时的 BUG
	if (!icons.length) options.normalize = true
	return new Promise<string>((resolve, reject) => {
		let content = ""
		const fontStream = new SVGIcons2SVGFontStream(options)
			.on("data", data => {
				content += data
			})
			.on("finish", () => {
				resolve(content)
			})
			.on("error", reject)
		for (const icon of icons) {
			const glyphStream = new Readable() as Readable & { metadata: any }
			glyphStream.push(icon.toString())
			glyphStream.push(null)
			glyphStream.metadata = {
				name: icon.iconName,
				unicode: [String.fromCodePoint(icon.unicode)]
			}
			fontStream.write(glyphStream)
		}
		fontStream.end()
	})
}

/** 生成 SVG 雪碧图标 */
function generateSVGSprite(icons: SVGIcon[], options: IconFontOptions) {
	let result = `<svg style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">`
	for (const icon of icons) {
		const node = Array.isArray((icon as SVGNode).children) ? Object.create(icon) as SVGNode : new xmldoc.XmlDocument(icon.toString()) as SVGNode
		node.name = "symbol"
		if (!node.attr.id) {
			node.attr.id = icon.className
		}
		result += "\n" + node.toString()
	}
	result += `\n</svg>`
	return result
}

/** 生成 JS 文件 */
function generateJS(svg: string, options: IconFontOptions) {
	return `!function iconFontInjectSVG(){var b=document.body,d;if(b){d=document.createElement("div");d.innerHTML=${quoteJSString(svg)};while(d.firstChild)b.insertBefore(d.firstChild,b.firstChild)}else setTimeout(iconFontInjectSVG,10)}();`
}

/** 生成 CSS 文件 */
function generateCSS(icons: SVGIcon[], options: IconFontOptions) {
	const baseName = getName(options.fileName ?? options.fontName ?? "icon", false)
	const classNamePrefix = options.classNamePrefix ?? baseName
	const hash = options.hash ?? icons.length
	return `@font-face {
	font-family: '${classNamePrefix}';
	src: url('${baseName}.eot?v=${hash}'); /* IE9 */
	src: url('${baseName}.eot?#iefix&v=${hash}') format('embedded-opentype') /* IE6-IE8 */, url('${baseName}.woff2?v=${hash}') format('woff2') /* Chrome, Firefox */, url('${baseName}.woff?v=${hash}') format('woff') /* Chrome, Firefox */, url('${baseName}.ttf?v=${hash}') format('truetype') /* Chrome, Firefox, Opera, Safari, Android, iOS 4.2+ */, url('${baseName}.svg?v=${hash}#regular') format('svg') /* iOS 4.1- */;
	font-weight: normal;
	font-style: normal;
}
.${classNamePrefix} {
	display: inline-block;
	font-family: '${classNamePrefix}';
	font-size: inherit;
	font-weight: normal;
	font-style: normal;
	font-variant: normal;
	line-height: 1;
	text-decoration: none !important;
	text-rendering: auto;
	text-transform: none;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
	user-select: none;
}
${icons.map(icon => `.${classNamePrefix ? classNamePrefix + "-" : classNamePrefix}${icon.className}:before { content: "\\${icon.unicode.toString(16)}"; }`).join("\n")}`
}

/** 生成 HTML 文件 */
function generateHTML(icons: SVGIcon[], options: IconFontOptions) {
	const baseName = getName(options.fileName ?? options.fontName ?? "icon", false)
	const classNamePrefix = options.classNamePrefix ?? baseName
	return `<link rel="stylesheet" href="${baseName}.css">
<div>
	<style>
		.icon-demo-container {
			margin: 0 auto;
			padding: 0;
			display: flex;
			flex-wrap: wrap;
			font-weight: normal;
			line-height: 1.5;
		}
		.icon-demo-container li {
			margin: 0;
			list-style: none;
			text-align: center;
			margin: 0 .5em 1.5em;
			width: 6em;
			border: 1px solid transparent;
			border-radius: 3px;
			cursor: pointer;
			word-break: break-all;
		}
		.icon-demo-container li:hover {
			border-color: #009b7d;
		}
		.icon-demo-container i {
			display: block;
			font-size: 1.5em;
			font-style: normal;
			user-select: text;
			line-height: 2;
		}
		.icon-demo-container small {
			display: block;
			font-size: .8em;
			font-family: monospace;
			opacity: .8;
		}
	</style>
	<ul class="icon-demo-container">
		${icons.map(icon => {
		const className = `${classNamePrefix ? classNamePrefix + "-" : classNamePrefix}${icon.className}`
		const unicodeChar = String.fromCodePoint(icon.unicode)
		const htmlEntity = `&#x${icon.unicode.toString(16)};`
		return `<li onclick='iconDemoCopy(this)' title="点击复制“${encodeHTML(icon.autoUnicode ? className : unicodeChar)}”">
			<i class="${encodeHTML(classNamePrefix)}">${htmlEntity}</i>
			${icon.title && icon.title !== icon.className ? `<div>${encodeHTML(icon.title)}</div>` : ""}
			<div onclick='iconDemoCopy(this); event.stopPropagation();' title="点击复制“${encodeHTML(className)}”">${encodeHTML(icon.className)}</div>
			<small onclick='iconDemoCopy(this); event.stopPropagation();' title="点击复制“${encodeHTML(icon.autoUnicode ? htmlEntity : unicodeChar)}”">U+${icon.unicode.toString(16).toUpperCase()}${icon.autoUnicode ? "" : encodeHTML(`(${unicodeChar})`)}</small>
		</li>`
	}).join("\n")}
	</ul>
	<script>
		function iconDemoCopy(elem) {
			var text = elem.title.slice(5, -1)
			copyText(text, function (success) {
				if (success) {
					showTip("已复制“" + text + "”", '<span style="color: #00796b">✔</span> ', 2000)
				} else {
					showTip("请手动复制“" + text + "”", '<span style="color: #d50000">✘</span> ', 4000)
				}
			})
			function copyText(text, callback) {
				if (navigator.clipboard) {
					return navigator.clipboard.writeText(text).then(function (){ callback(true) }, function (){ callback(false) })
				}
				var textArea = document.body.appendChild(document.createElement("textarea"))
				textArea.value = text
				try {
					if (/ipad|iphone/i.test(navigator.userAgent)) {
						var range = document.createRange()
						range.selectNodeContents(textArea)
						var selection = window.getSelection()
						selection.removeAllRanges()
						selection.addRange(range)
						textArea.setSelectionRange(0, 999999)
					} else {
						textArea.select()
					}
					callback(document.execCommand("Copy"))
				} catch (err) {
					callback(false)
				} finally {
					document.body.removeChild(textArea)
				}
			}
			function showTip(text, icon, timeout) {
				var tip = showTip.elem = document.body.appendChild(document.createElement("div"))
				tip.textContent = text
				tip.innerHTML = icon + tip.innerHTML
				tip.style = "position: fixed; left: 50%; transform: translate(-50%, -6em); z-index: 65530; top: 2em; opacity: 1; background: #fff; border-radius: 4px; padding: .5em 1em;min-width: 13em; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); line-height: 2; transition: transform .3s;"
				tip.offsetParent
				tip.style.transform = "translate(-50%, 0)"
				setTimeout(function () {
					var tip = showTip.elem
					tip.style.transform = "translate(-50%, -6em)"
					setTimeout(function () {
						document.body.removeChild(tip)
					}, 400)
				}, timeout)
			}
		}
	</script>
</div>`
}