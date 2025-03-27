const fs = require('fs');
const path = require('path');

// 要处理的目录
const directories = [
    'libs/realism-effects/src/utils/shader',
    'libs/realism-effects/src/ssgi/shader',
    'libs/realism-effects/src/denoise/shader',
    'src/effects/glsl',
    'src/materials/glsl'
];

// 要处理的文件扩展名
const extensions = ['.vert', '.frag', '.glsl'];

// BOM标记 (UTF-8)
const BOM = Buffer.from([0xEF, 0xBB, 0xBF]);

// 递归处理目录中的所有文件
function processDirectory(dir) {
    try {
        const files = fs.readdirSync(dir);

        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                // 递归处理子目录
                processDirectory(filePath);
            } else if (stat.isFile() && extensions.includes(path.extname(file))) {
                // 处理匹配的文件类型
                removeBOM(filePath);
            }
        }
    } catch (err) {
        console.error(`无法处理目录 ${dir}: ${err.message}`);
    }
}

// 从文件中移除BOM标记
function removeBOM(filePath) {
    try {
        // 读取文件
        const content = fs.readFileSync(filePath);

        // 检查是否存在BOM
        if (content.length >= 3 && content[0] === BOM[0] && content[1] === BOM[1] && content[2] === BOM[2]) {
            console.log(`从文件 ${filePath} 中移除BOM`);

            // 移除BOM并写回文件
            const newContent = content.slice(3);
            fs.writeFileSync(filePath, newContent);
        }
    } catch (err) {
        console.error(`无法处理文件 ${filePath}: ${err.message}`);
    }
}

// 处理所有指定的目录
console.log('开始移除BOM标记...');
directories.forEach(dir => {
    console.log(`处理目录: ${dir}`);
    processDirectory(dir);
});
console.log('BOM移除完成！'); 