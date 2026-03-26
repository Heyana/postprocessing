import { createRequire } from "module";
import { glsl } from "esbuild-plugin-glsl";
import esbuild from "esbuild";
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pkg = require("./package");

const plugins = [glsl({ minify: false })];
const external = ["spatial-controls", "run-scene-core", "tweakpane"];
const alias = {
    "three": "run-scene-core",
    "postprocessing": "./src/index.js"
};

console.log("🔍 Building with metafile for analysis...\n");

const result = await esbuild.build({
    entryPoints: ["./src/index.js"],
    outfile: "./build/analysis.js",
    logLevel: "info",
    format: "esm",
    target: "es2019",
    bundle: true,
    external,
    plugins,
    alias,
    metafile: true
});

fs.writeFileSync('build/meta.json', JSON.stringify(result.metafile, null, 2));

// 处理数据
const inputs = result.metafile.inputs;
const outputs = result.metafile.outputs;

// 构建层次结构
function buildHierarchy(inputs) {
    const root = { name: "root", children: [], value: 0 };

    Object.entries(inputs).forEach(([filePath, info]) => {
        const parts = filePath.split(/[/\\]/);
        let current = root;

        parts.forEach((part, index) => {
            let child = current.children.find(c => c.name === part);

            if (!child) {
                child = {
                    name: part,
                    children: [],
                    value: 0,
                    path: index === parts.length - 1 ? filePath : null
                };
                current.children.push(child);
            }

            if (index === parts.length - 1) {
                child.value = info.bytes;
            }

            current = child;
        });
    });

    // 递归计算文件夹大小
    function calculateSize(node) {
        if (node.children.length === 0) {
            return node.value;
        }
        node.value = node.children.reduce((sum, child) => sum + calculateSize(child), 0);
        return node.value;
    }

    calculateSize(root);
    return root;
}

const hierarchy = buildHierarchy(inputs);
const totalSize = Object.values(inputs).reduce((sum, info) => sum + info.bytes, 0);

// 生成 HTML
const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Bundle Analyzer - ${pkg.name}</title>
	<script src="https://d3js.org/d3.v7.min.js"></script>
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body {
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
			background: #1a1a1a;
			color: #e0e0e0;
			overflow: hidden;
		}
		
		#header {
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
			padding: 20px 30px;
			box-shadow: 0 2px 10px rgba(0,0,0,0.3);
		}
		
		h1 {
			font-size: 28px;
			font-weight: 600;
			margin-bottom: 10px;
			color: white;
		}
		
		#stats {
			display: flex;
			gap: 40px;
			margin-top: 15px;
		}
		
		.stat {
			display: flex;
			flex-direction: column;
		}
		
		.stat-label {
			font-size: 12px;
			color: rgba(255,255,255,0.8);
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}
		
		.stat-value {
			font-size: 24px;
			font-weight: 700;
			color: white;
			margin-top: 5px;
		}
		
		#controls {
			background: #252525;
			padding: 15px 30px;
			border-bottom: 1px solid #333;
			display: flex;
			align-items: center;
			gap: 20px;
		}
		
		.btn {
			background: #667eea;
			color: white;
			border: none;
			padding: 8px 16px;
			border-radius: 6px;
			cursor: pointer;
			font-size: 14px;
			font-weight: 500;
			transition: all 0.2s;
		}
		
		.btn:hover {
			background: #5568d3;
			transform: translateY(-1px);
		}
		
		.btn:active {
			transform: translateY(0);
		}
		
		.breadcrumb {
			flex: 1;
			font-size: 14px;
			color: #999;
			display: flex;
			align-items: center;
			gap: 8px;
		}
		
		.breadcrumb-item {
			color: #667eea;
			cursor: pointer;
			transition: color 0.2s;
		}
		
		.breadcrumb-item:hover {
			color: #5568d3;
		}
		
		.breadcrumb-separator {
			color: #555;
		}
		
		#container {
			display: flex;
			height: calc(100vh - 180px);
		}
		
		#chart {
			flex: 1;
			position: relative;
			overflow: hidden;
		}
		
		#sidebar {
			width: 380px;
			background: #252525;
			border-left: 1px solid #333;
			overflow-y: auto;
			padding: 20px;
		}
		
		#sidebar h3 {
			font-size: 18px;
			margin-bottom: 20px;
			color: #667eea;
			display: flex;
			align-items: center;
			gap: 8px;
		}
		
		.info-section {
			background: #2a2a2a;
			border-radius: 8px;
			padding: 15px;
			margin-bottom: 15px;
		}
		
		.info-row {
			display: flex;
			justify-content: space-between;
			padding: 8px 0;
			border-bottom: 1px solid #333;
		}
		
		.info-row:last-child {
			border-bottom: none;
		}
		
		.info-label {
			color: #999;
			font-size: 13px;
		}
		
		.info-value {
			color: #e0e0e0;
			font-weight: 600;
			font-size: 13px;
		}
		
		.file-path {
			background: #1a1a1a;
			padding: 10px;
			border-radius: 6px;
			font-family: 'Courier New', monospace;
			font-size: 12px;
			color: #4ec9b0;
			word-break: break-all;
			margin-top: 10px;
		}
		
		.top-files {
			margin-top: 20px;
		}
		
		.file-item {
			background: #2a2a2a;
			padding: 12px;
			border-radius: 6px;
			margin-bottom: 10px;
			cursor: pointer;
			transition: all 0.2s;
		}
		
		.file-item:hover {
			background: #333;
			transform: translateX(4px);
		}
		
		.file-name {
			font-size: 13px;
			color: #e0e0e0;
			margin-bottom: 5px;
		}
		
		.file-stats {
			display: flex;
			gap: 15px;
			font-size: 12px;
			color: #999;
		}
		
		.node {
			cursor: pointer;
			transition: opacity 0.2s;
		}
		
		.node:hover {
			opacity: 0.85;
		}
		
		.node-label {
			fill: white;
			font-size: 11px;
			font-weight: 500;
			pointer-events: none;
			text-shadow: 0 1px 3px rgba(0,0,0,0.8);
		}
		
		#tooltip {
			position: absolute;
			background: rgba(0,0,0,0.95);
			border: 1px solid #667eea;
			padding: 12px 16px;
			border-radius: 8px;
			pointer-events: none;
			opacity: 0;
			transition: opacity 0.2s;
			font-size: 13px;
			box-shadow: 0 4px 20px rgba(0,0,0,0.5);
			z-index: 1000;
		}
		
		.tooltip-title {
			font-weight: 600;
			margin-bottom: 8px;
			color: #667eea;
		}
		
		.tooltip-row {
			margin: 4px 0;
			color: #e0e0e0;
		}
		
		::-webkit-scrollbar {
			width: 8px;
		}
		
		::-webkit-scrollbar-track {
			background: #1a1a1a;
		}
		
		::-webkit-scrollbar-thumb {
			background: #667eea;
			border-radius: 4px;
		}
		
		::-webkit-scrollbar-thumb:hover {
			background: #5568d3;
		}
	</style>
</head>
<body>
	<div id="header">
		<h1>📦 Bundle Analyzer</h1>
		<div id="stats">
			<div class="stat">
				<span class="stat-label">Total Size</span>
				<span class="stat-value">${(totalSize / 1024).toFixed(2)} KB</span>
			</div>
			<div class="stat">
				<span class="stat-label">Files</span>
				<span class="stat-value">${Object.keys(inputs).length}</span>
			</div>
			<div class="stat">
				<span class="stat-label">Package</span>
				<span class="stat-value">${pkg.name}</span>
			</div>
		</div>
	</div>
	
	<div id="controls">
		<button class="btn" id="reset-btn">🏠 Reset View</button>
		<div class="breadcrumb" id="breadcrumb">
			<span class="breadcrumb-item">root</span>
		</div>
	</div>
	
	<div id="container">
		<div id="chart"></div>
		<div id="sidebar">
			<div id="info"></div>
		</div>
	</div>
	
	<div id="tooltip"></div>

	<script>
		const data = ${JSON.stringify(hierarchy)};
		const totalSize = ${totalSize};
		
		const width = window.innerWidth - 380;
		const height = window.innerHeight - 180;
		
		const colorScale = d3.scaleLinear()
			.domain([0, 5])
			.range(["#667eea", "#f093fb"])
			.interpolate(d3.interpolateHcl);
		
		const treemap = d3.treemap()
			.size([width, height])
			.paddingInner(3)
			.paddingOuter(6)
			.round(true);
		
		const svg = d3.select("#chart")
			.append("svg")
			.attr("width", width)
			.attr("height", height);
		
		const tooltip = d3.select("#tooltip");
		
		let root = d3.hierarchy(data)
			.sum(d => d.value)
			.sort((a, b) => b.value - a.value);
		
		let currentNode = root;
		
		treemap(root);
		
		function render(node) {
			currentNode = node;
			svg.selectAll("*").remove();
			
			const nodes = node.descendants().filter(d => d.depth === node.depth || d.parent === node);
			
			const cell = svg.selectAll("g")
				.data(nodes)
				.join("g")
				.attr("class", "node")
				.attr("transform", d => \`translate(\${d.x0},\${d.y0})\`);
			
			cell.append("rect")
				.attr("width", d => Math.max(0, d.x1 - d.x0))
				.attr("height", d => Math.max(0, d.y1 - d.y0))
				.attr("fill", d => {
					if (d === node) return "#2a2a2a";
					const depth = d.depth - node.depth;
					return colorScale(depth);
				})
				.attr("stroke", "#1a1a1a")
				.attr("stroke-width", 2)
				.attr("rx", 4);
			
			cell.append("clipPath")
				.attr("id", (d, i) => \`clip-\${i}\`)
				.append("rect")
				.attr("width", d => Math.max(0, d.x1 - d.x0 - 8))
				.attr("height", d => Math.max(0, d.y1 - d.y0 - 8));
			
			cell.append("text")
				.attr("class", "node-label")
				.attr("clip-path", (d, i) => \`url(#clip-\${i})\`)
				.attr("x", 6)
				.attr("y", 18)
				.text(d => {
					const width = d.x1 - d.x0;
					const height = d.y1 - d.y0;
					if (width < 60 || height < 25) return "";
					return d.data.name;
				});
			
			cell.append("text")
				.attr("class", "node-label")
				.attr("clip-path", (d, i) => \`url(#clip-\${i})\`)
				.attr("x", 6)
				.attr("y", 32)
				.style("font-size", "10px")
				.style("fill", "rgba(255,255,255,0.7)")
				.text(d => {
					const width = d.x1 - d.x0;
					const height = d.y1 - d.y0;
					if (width < 80 || height < 40) return "";
					return \`\${(d.value / 1024).toFixed(1)} KB\`;
				});
			
			cell.on("click", (event, d) => {
				event.stopPropagation();
				if (d.children && d.children.length > 0) {
					render(d);
					updateBreadcrumb(d);
					updateInfo(d);
				}
			});
			
			cell.on("mouseover", (event, d) => {
				const percentage = ((d.value / totalSize) * 100).toFixed(2);
				tooltip
					.style("opacity", 1)
					.style("left", (event.pageX + 15) + "px")
					.style("top", (event.pageY + 15) + "px")
					.html(\`
						<div class="tooltip-title">\${d.data.name}</div>
						<div class="tooltip-row">Size: \${(d.value / 1024).toFixed(2)} KB</div>
						<div class="tooltip-row">Percentage: \${percentage}%</div>
						\${d.children ? \`<div class="tooltip-row">Files: \${d.children.length}</div>\` : ''}
					\`);
			});
			
			cell.on("mouseout", () => {
				tooltip.style("opacity", 0);
			});
			
			updateBreadcrumb(node);
			updateInfo(node);
		}
		
		function updateBreadcrumb(node) {
			const path = [];
			let current = node;
			while (current) {
				path.unshift(current);
				current = current.parent;
			}
			
			const breadcrumb = d3.select("#breadcrumb");
			breadcrumb.selectAll("*").remove();
			
			path.forEach((n, i) => {
				if (i > 0) {
					breadcrumb.append("span")
						.attr("class", "breadcrumb-separator")
						.text("/");
				}
				
				breadcrumb.append("span")
					.attr("class", "breadcrumb-item")
					.text(n.data.name)
					.on("click", () => {
						render(n);
					});
			});
		}
		
		function updateInfo(node) {
			const info = d3.select("#info");
			info.selectAll("*").remove();
			
			info.append("h3").html("📊 Details");
			
			const mainSection = info.append("div").attr("class", "info-section");
			
			mainSection.append("div").attr("class", "info-row")
				.html(\`
					<span class="info-label">Name</span>
					<span class="info-value">\${node.data.name}</span>
				\`);
			
			mainSection.append("div").attr("class", "info-row")
				.html(\`
					<span class="info-label">Size</span>
					<span class="info-value">\${(node.value / 1024).toFixed(2)} KB</span>
				\`);
			
			mainSection.append("div").attr("class", "info-row")
				.html(\`
					<span class="info-label">Percentage</span>
					<span class="info-value">\${((node.value / totalSize) * 100).toFixed(2)}%</span>
				\`);
			
			if (node.data.path) {
				mainSection.append("div").attr("class", "file-path")
					.text(node.data.path);
			}
			
			if (node.children && node.children.length > 0) {
				info.append("h3").html("📁 Top Children");
				
				const topChildren = node.children
					.sort((a, b) => b.value - a.value)
					.slice(0, 10);
				
				const filesDiv = info.append("div").attr("class", "top-files");
				
				topChildren.forEach(child => {
					const item = filesDiv.append("div")
						.attr("class", "file-item")
						.on("click", () => {
							if (child.children && child.children.length > 0) {
								render(child);
							}
						});
					
					item.append("div")
						.attr("class", "file-name")
						.text(child.data.name);
					
					item.append("div")
						.attr("class", "file-stats")
						.html(\`
							<span>\${(child.value / 1024).toFixed(2)} KB</span>
							<span>\${((child.value / node.value) * 100).toFixed(1)}%</span>
						\`);
				});
			}
		}
		
		document.getElementById("reset-btn").addEventListener("click", () => {
			render(root);
		});
		
		render(root);
	</script>
</body>
</html>`;

fs.writeFileSync('build/bundle-report.html', html);

// 启动本地服务器
const PORT = 8919;

const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
    } else if (req.url === '/meta.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(fs.readFileSync('build/meta.json'));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`
✅ Bundle analysis complete!

📊 Analyzer running at:
   http://localhost:\${PORT}

📄 Static report saved to:
   build/bundle-report.html

💡 Press Ctrl+C to stop the server
`);
});
