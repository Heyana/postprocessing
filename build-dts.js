import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 通用的 TypeScript 类型声明文件生成脚本
 * 
 * 这个脚本将自动处理 TypeScript 到 JavaScript 的转换过程中的类型声明文件：
 * 1. 处理 src 目录下的所有 TypeScript 文件
 * 2. 生成类型声明文件（通过执行 tsc）
 * 3. 将生成的 .d.ts 文件复制到 build/types 目录，保持原始目录结构
 * 4. 自动将新生成的类型添加到 index.d.ts 中，避免重复导出
 * 
 * 使用方法：
 * - 基本用法： node build-dts.js
 * - 跳过编译： node build-dts.js --skip-compilation
 * - 调试模式： node build-dts.js --debug
 */
try {
    // 获取命令行参数
    const args = process.argv.slice(2);
    const skipCompilation = args.includes('--skip-compilation');
    const debugMode = args.includes('--debug');

    // 配置目录路径
    const SRC_DIR = path.join(__dirname, 'src');
    const TARGET_DIR = path.join(__dirname, 'build', 'types');
    const ORIGINAL_TYPES_DIR = path.join(__dirname, 'types');

    // 用于调试输出
    const debug = (message) => {
        if (debugMode) {
            console.log(`[DEBUG] ${message}`);
        }
    };

    /**
     * 递归复制目录中的所有文件
     * @param {string} sourceDir - 源目录
     * @param {string} targetDir - 目标目录
     * @param {RegExp} [filter] - 文件名过滤正则表达式
     */
    const copyDirectory = (sourceDir, targetDir, filter = null) => {
        if (!fs.existsSync(sourceDir)) {
            debug(`Source directory does not exist: ${sourceDir}`);
            return;
        }

        // 确保目标目录存在
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        // 读取源目录中的所有文件和目录
        const items = fs.readdirSync(sourceDir);

        for (const item of items) {
            const sourceItemPath = path.join(sourceDir, item);
            const targetItemPath = path.join(targetDir, item);

            // 获取文件/目录的状态
            const stats = fs.statSync(sourceItemPath);

            if (stats.isDirectory()) {
                // 递归复制子目录
                copyDirectory(sourceItemPath, targetItemPath, filter);
            } else if (stats.isFile() && (!filter || filter.test(item))) {
                // 复制文件（如果通过过滤器）
                debug(`Copying file: ${sourceItemPath} -> ${targetItemPath}`);
                fs.copyFileSync(sourceItemPath, targetItemPath);
            }
        }
    };

    // 步骤1: 生成声明文件
    if (!skipCompilation) {
        console.log('Generating declaration files from TypeScript sources...');
        try {
            execSync('tsc -p tsconfig.dts.json --skipLibCheck --noEmitOnError --listEmittedFiles', { stdio: 'inherit' });
        } catch (e) {
            console.warn('TypeScript compilation had errors, but we will continue with declaration file generation.');
        }
    } else {
        console.log('Skipping TypeScript compilation (--skip-compilation flag detected)');
    }

    // 步骤2: 确保目标目录存在
    if (!fs.existsSync(TARGET_DIR)) {
        fs.mkdirSync(TARGET_DIR, { recursive: true });
    }

    // 步骤3: 复制原始类型声明文件（如果存在）
    if (fs.existsSync(ORIGINAL_TYPES_DIR)) {
        console.log('Copying original declaration files...');
        try {
            // 复制所有 .d.ts 文件到目标目录
            copyDirectory(ORIGINAL_TYPES_DIR, TARGET_DIR, /\.d\.ts$/);

            // 复制 index.d.ts 为 index.d.cts (如果存在)
            const indexDtsPath = path.join(ORIGINAL_TYPES_DIR, 'index.d.ts');
            const indexDctsPath = path.join(TARGET_DIR, 'index.d.cts');

            if (fs.existsSync(indexDtsPath)) {
                debug(`Copying ${indexDtsPath} to ${indexDctsPath}`);
                fs.copyFileSync(indexDtsPath, indexDctsPath);
            }

            console.log('Original declaration files copied successfully.');
        } catch (e) {
            console.warn('Error copying original declaration files. Continuing anyway.', e);
        }
    }

    // 步骤4: 处理所有生成的声明文件
    console.log('Processing TypeScript declaration files...');
    const moduleExports = new Map();

    /**
     * 递归查找目录中的所有类型声明文件
     * @param {string} baseDir - 要搜索的基础目录
     * @returns {Array<{fullPath: string, moduleName: string, relativePath: string}>} - 找到的文件信息数组
     */
    const findDeclarationFiles = (baseDir) => {
        const result = [];

        try {
            // 使用平台特定的命令查找所有 .d.ts 文件
            const isWindows = process.platform === 'win32';
            let command;

            if (isWindows) {
                command = `dir /s /b "${baseDir}\\*.d.ts"`;
            } else {
                command = `find "${baseDir}" -name "*.d.ts" -type f`;
            }

            const files = execSync(command, { encoding: 'utf8' })
                .split('\n')
                .filter(Boolean)
                .map(file => file.trim());

            for (const file of files) {
                const moduleName = path.basename(file, '.d.ts');
                result.push({
                    fullPath: file,
                    moduleName,
                    relativePath: path.relative(baseDir, file)
                });
            }
        } catch (err) {
            console.warn(`Warning: Could not list files in ${baseDir}`, err.message);
        }

        return result;
    };

    /**
     * 查找源代码目录中的所有 TypeScript 文件
     * @param {string} dir - 要搜索的源代码目录
     * @param {string} fileExtension - 文件扩展名，默认为 .ts
     * @returns {Array<{fullPath: string, moduleName: string, relativePath: string}>} - 找到的文件信息数组
     */
    const findSourceFiles = (dir, fileExtension = '.ts') => {
        const result = [];
        try {
            const isWindows = process.platform === 'win32';
            let command;

            if (isWindows) {
                command = `dir /s /b "${dir}\\*${fileExtension}"`;
            } else {
                command = `find "${dir}" -name "*${fileExtension}" -type f`;
            }

            const files = execSync(command, { encoding: 'utf8' })
                .split('\n')
                .filter(file => Boolean(file) && !file.includes('.d.ts'))
                .map(file => file.trim());

            for (const file of files) {
                const moduleName = path.basename(file, fileExtension);
                result.push({
                    fullPath: file,
                    moduleName,
                    relativePath: path.relative(dir, file)
                });
            }
        } catch (err) {
            console.warn(`Warning: Could not list TypeScript files in ${dir}`, err.message);
        }

        return result;
    };

    // 步骤5: 找出源码中的 TypeScript 文件
    const sourceFiles = findSourceFiles(SRC_DIR);
    console.log(`Found ${sourceFiles.length} TypeScript source files.`);

    if (debugMode) {
        sourceFiles.forEach(file => {
            debug(`Source file: ${file.relativePath}`);
        });
    }

    // 创建源文件模块集合（用于快速查找）
    const sourceModules = new Set(sourceFiles.map(file => file.moduleName));

    // 步骤6: 查找生成的声明文件
    const generatedTypesDir = path.join(__dirname, 'build', 'types');
    const declarationFiles = findDeclarationFiles(generatedTypesDir);
    console.log(`Found ${declarationFiles.length} declaration files.`);

    // 用于记录和避免重复的模块导出
    const processedModules = new Set();

    // 步骤7: 复制生成的声明文件到目标目录
    let processedFiles = 0;
    for (const file of declarationFiles) {
        const { fullPath, moduleName, relativePath } = file;

        // 如果这个模块对应于源代码中的一个 TypeScript 文件，处理它
        if (sourceModules.has(moduleName)) {
            // 检查模块是否已经处理过（避免重复）
            if (processedModules.has(moduleName)) {
                debug(`Skipping duplicate module: ${moduleName}`);
                continue;
            }

            const destFile = path.join(TARGET_DIR, relativePath);
            const destDir = path.dirname(destFile);

            debug(`Processing: ${moduleName} -> ${relativePath}`);

            // 确保目标目录存在
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }

            try {
                // 复制文件
                fs.copyFileSync(fullPath, destFile);

                // 计算相对路径（用于 export 语句）
                let exportPath = './' + moduleName;

                // 如果文件在子目录中，需要调整相对路径
                if (path.dirname(relativePath) !== '.') {
                    const dirName = path.dirname(relativePath);
                    exportPath = './' + path.join(dirName, moduleName).replace(/\\/g, '/');
                }

                // 记录需要导出的模块
                moduleExports.set(moduleName, exportPath);
                processedModules.add(moduleName);
                processedFiles++;
            } catch (err) {
                console.error(`Error copying file ${fullPath}:`, err.message);
            }
        }
    }

    console.log(`Processed ${processedFiles} declaration files.`);

    // 步骤8: 更新 index.d.ts 文件以包含所有导出
    const indexPath = path.join(TARGET_DIR, 'index.d.ts');
    const indexCtsPath = path.join(TARGET_DIR, 'index.d.cts');

    if (fs.existsSync(indexPath)) {
        console.log('Updating index.d.ts to include new types...');
        let content = fs.readFileSync(indexPath, 'utf8');

        // 获取当前已有的导出语句
        const existingExports = new Set();
        const exportRegex = /export\s+\*\s+from\s+["'](.+)["'];?/g;
        let match;

        while ((match = exportRegex.exec(content)) !== null) {
            existingExports.add(match[1]);
        }

        debug(`Found ${existingExports.size} existing exports in index.d.ts`);

        let addedExports = 0;
        let newExportContent = '';

        // 添加所有需要导出的模块
        moduleExports.forEach((exportPath, moduleName) => {
            const exportStatement = `export * from "${exportPath}";`;

            // 检查是否已存在相同的导出
            if (!existingExports.has(exportPath)) {
                newExportContent += `${exportStatement}\n`;
                addedExports++;
            } else {
                debug(`Export already exists: ${exportPath}`);
            }
        });

        if (addedExports > 0) {
            console.log(`Adding ${addedExports} new module exports to index.d.ts`);
            // 添加新的导出到文件末尾
            content += `\n${newExportContent}`;
            fs.writeFileSync(indexPath, content);

            // 同样更新 CJS 版本（如果存在）
            if (fs.existsSync(indexCtsPath)) {
                fs.writeFileSync(indexCtsPath, content);
                console.log('Updated index.d.cts with the same exports.');
            }
        } else {
            console.log('No new exports needed to be added to index.d.ts');
        }
    } else {
        console.warn(`Warning: index.d.ts not found at ${indexPath}. No exports were added.`);
    }

    console.log('Declaration files generation completed successfully!');
} catch (error) {
    console.error('Error generating declaration files:', error.message);
    console.error(error.stack);
    process.exit(1);
} 