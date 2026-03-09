import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveMJCFSource } from '../src/core/parsers/mjcf/mjcfSourceResolver';
import { parseMJCF } from '../src/core/parsers/mjcf/mjcfParser';
import { parseMJCFModel } from '../src/core/parsers/mjcf/mjcfModel';
import {
    createCanonicalSnapshotFromOracleExport,
    createCanonicalSnapshotFromParsedModel,
    diffCanonicalSnapshots,
} from '../src/core/parsers/mjcf/mjcfSnapshot';
import type { RobotFile } from '../src/types';

interface CompareCliOptions {
    casePath: string;
    outputPath?: string;
    oracleJsonPath?: string;
    smokeLoad: boolean;
}

function installDomGlobals(): void {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { contentType: 'text/html' });
    globalThis.window = dom.window as any;
    globalThis.document = dom.window.document as any;
    globalThis.DOMParser = dom.window.DOMParser as any;
    globalThis.XMLSerializer = dom.window.XMLSerializer as any;
    globalThis.Node = dom.window.Node as any;
    globalThis.Element = dom.window.Element as any;
    globalThis.Document = dom.window.Document as any;
}

function parseArgs(argv: string[]): CompareCliOptions {
    const args = [...argv];
    const casePath = args.shift();
    if (!casePath) {
        throw new Error('Usage: node mjcf_compare.mjs <mjcf-file> [--output path] [--smoke-load]');
    }

    let outputPath: string | undefined;
    let smokeLoad = false;
    let oracleJsonPath: string | undefined;

    while (args.length > 0) {
        const token = args.shift();
        if (token === '--output') {
            outputPath = args.shift();
            continue;
        }
        if (token === '--oracle-json') {
            const value = args.shift();
            oracleJsonPath = value ? path.resolve(value) : undefined;
            continue;
        }
        if (token === '--smoke-load') {
            smokeLoad = true;
            continue;
        }
        throw new Error(`Unknown argument: ${token}`);
    }

    return {
        casePath: path.resolve(casePath),
        outputPath: outputPath ? path.resolve(outputPath) : undefined,
        oracleJsonPath,
        smokeLoad,
    };
}

function collectProjectFiles(rootDir: string): RobotFile[] {
    const files: RobotFile[] = [];

    const visit = (currentDir: string): void => {
        for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                visit(fullPath);
                continue;
            }

            const ext = path.extname(entry.name).toLowerCase();
            if (ext !== '.xml' && ext !== '.mjcf') {
                continue;
            }

            files.push({
                name: fullPath,
                content: fs.readFileSync(fullPath, 'utf8'),
                format: 'mjcf',
            });
        }
    };

    visit(rootDir);
    return files;
}

function runOracle(casePath: string): any {
    const tempDir = path.resolve('.tmp', 'mjcf-compare');
    fs.mkdirSync(tempDir, { recursive: true });
    const outputPath = path.join(tempDir, `${path.basename(casePath, path.extname(casePath))}.oracle.full.json`);

    const result = spawnSync(
        'uv.exe',
        ['run', '--with', 'mujoco', '--script', 'scripts/read_mjcf.py', casePath, '--full-json', '--output', outputPath],
        {
            cwd: process.cwd(),
            encoding: 'utf8',
            stdio: 'pipe',
        },
    );

    if (result.status !== 0) {
        const errorMessage = result.error instanceof Error
            ? `${result.error.name}: ${result.error.message}`
            : (result.stderr || result.stdout || 'unknown error');
        throw new Error(`Oracle failed with exit code ${result.status}: ${errorMessage}`);
    }

    return parseOracleJsonFile(outputPath);
}

function parseOracleJsonFile(filePath: string): any {
    const text = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(text.replace(/\bNaN\b/g, 'null'));
}

function summarizeRobotState(robotState: ReturnType<typeof parseMJCF>) {
    if (!robotState) {
        return null;
    }

    return {
        name: robotState.name,
        linkCount: Object.keys(robotState.links).length,
        jointCount: Object.keys(robotState.joints).length,
        rootLinkId: robotState.rootLinkId,
    };
}

async function main(): Promise<void> {
    installDomGlobals();
    const options = parseArgs(process.argv.slice(2));
    const projectFiles = collectProjectFiles(path.dirname(options.casePath));
    const selectedFile = projectFiles.find((file) => path.resolve(file.name) === options.casePath);
    if (!selectedFile) {
        throw new Error(`MJCF file not found in project scan: ${options.casePath}`);
    }

    const resolvedSource = resolveMJCFSource(selectedFile, projectFiles);
    const robotState = parseMJCF(resolvedSource.content);
    const parsedModel = parseMJCFModel(resolvedSource.content);
    if (!parsedModel) {
        throw new Error('TS MJCF model parsing failed');
    }

    if (options.smokeLoad) {
        const { loadMJCFToThreeJS } = await import('../src/core/parsers/mjcf/mjcfLoader');
        await loadMJCFToThreeJS(resolvedSource.content, {});
    }

    const oracleExport = options.oracleJsonPath
        ? parseOracleJsonFile(options.oracleJsonPath)
        : runOracle(options.casePath);
    const tsSnapshot = createCanonicalSnapshotFromParsedModel(parsedModel, {
        sourceFile: resolvedSource.sourceFile.name,
        effectiveFile: resolvedSource.effectiveFile.name,
    });
    const oracleSnapshot = createCanonicalSnapshotFromOracleExport(oracleExport, {
        sourceFile: options.casePath,
        effectiveFile: options.casePath,
    });
    const diffs = diffCanonicalSnapshots(oracleSnapshot, tsSnapshot);

    const diffSummary = diffs.reduce<Record<string, number>>((summary, diff) => {
        summary[diff.type] = (summary[diff.type] || 0) + 1;
        return summary;
    }, {});

    const payload = {
        schema: 'urdf-studio.mjcf-compare/v1',
        casePath: options.casePath,
        resolvedSource: {
            sourceFile: resolvedSource.sourceFile.name,
            effectiveFile: resolvedSource.effectiveFile.name,
            basePath: resolvedSource.basePath,
        },
        robotState: summarizeRobotState(robotState),
        oracleCounts: oracleSnapshot.counts,
        tsCounts: tsSnapshot.counts,
        diffSummary,
        diffCount: diffs.length,
        diffs,
    };

    const rendered = `${JSON.stringify(payload, null, 2)}\n`;
    if (options.outputPath) {
        fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
        fs.writeFileSync(options.outputPath, rendered, 'utf8');
        console.log(`MJCF compare written to: ${options.outputPath}`);
        return;
    }

    process.stdout.write(rendered);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
