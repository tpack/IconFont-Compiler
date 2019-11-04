import { readText, writeFile } from "tutils/fileSystemSync"
import { compileIconFont } from "../iconFontCompiler"

async function main() {
	process.chdir(__dirname)
	const result = await compileIconFont(readText("./fixtures/iconfont.iconfont"), "./fixtures/iconfont.iconfont")
	writeFile(`./dist/iconfont.svg`, result.svg)
	writeFile(`./dist/iconfont.ttf`, result.ttf)
	writeFile(`./dist/iconfont.eot`, result.eot)
	writeFile(`./dist/iconfont.woff`, result.woff)
	writeFile(`./dist/iconfont.woff2`, result.woff2)
	writeFile(`./dist/iconfont.css`, result.css)
	writeFile(`./dist/iconfont.html`, result.html)
	console.log("Generated successfully")
}

main().catch(console.error)