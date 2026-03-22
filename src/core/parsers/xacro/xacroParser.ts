/**
 * Xacro Parser - Basic xacro processing for browser environment
 *
 * Supports:
 * - <xacro:property> definitions
 * - ${...} variable substitution
 * - <xacro:include> (requires file content map)
 * - <xacro:macro> definitions and calls
 * - <xacro:if> / <xacro:unless> conditionals
 * - <xacro:arg> for command-line style arguments
 *
 * Limitations:
 * - No Python expression evaluation (only simple variable substitution)
 * - $(find package) only supports path resolution inside imported file map
 * - Complex expressions need manual simplification
 */

import { RobotState } from '@/types';
import { parseURDF } from '@/core/parsers/urdf';

export interface XacroArgs {
    [key: string]: string;
}

export interface XacroFileMap {
    [path: string]: string;
}

interface XacroContext {
    properties: Map<string, string>;
    macros: Map<string, { params: string[], body: string }>;
    args: XacroArgs;
    fileMap: XacroFileMap;
    basePath: string;
    includeStack: string[];
}

/**
 * Check if content is a xacro file
 */
export function isXacro(content: string): boolean {
    return content.includes('xacro:') ||
           content.includes('xmlns:xacro') ||
           /\$\{[^}]+\}/.test(content);
}

/**
 * Preprocess XML content to fix common issues
 */
function preprocessXML(content: string): string {
    // Remove complete XML comments first, then clean any orphan '-->' tails.
    // Some third-party xacro files contain broken comment tails like '</link> -->'.
    content = content.replace(/<!--[\s\S]*?-->/g, '');
    content = content.replace(/-->/g, '');

    // Remove XML declaration if it's not at the start (after comments)
    // Find if there's an XML declaration after content
    const xmlDeclMatch = content.match(/(<\?xml[^?]*\?>)/);
    if (xmlDeclMatch) {
        const declIndex = content.indexOf(xmlDeclMatch[1]);
        // Check if there's non-whitespace content before the declaration
        const beforeDecl = content.substring(0, declIndex).trim();
        if (beforeDecl.length > 0) {
            // Remove the declaration as it's in an invalid position
            content = content.replace(xmlDeclMatch[1], '');
        }
    }

    return content.trim();
}

/**
 * Parse xacro:arg elements to get default values
 */
function parseXacroArgs(content: string): Map<string, string> {
    const args = new Map<string, string>();
    const argRegex = /<xacro:arg\b([^>]*?)\/>/g;

    let match: RegExpExecArray | null;
    while ((match = argRegex.exec(content)) !== null) {
        const attrs = match[1];
        const nameMatch = attrs.match(/\bname=["']([^"']+)["']/);
        const defaultMatch = attrs.match(/\bdefault=["']([^"']*)["']/);
        if (nameMatch && defaultMatch) {
            args.set(nameMatch[1], defaultMatch[1]);
        }
    }

    return args;
}

/**
 * Parse xacro:property elements
 */
function parseProperties(content: string, ctx: XacroContext): void {
    // Match <xacro:property name="..." value="..."/>
    const propRegex = /<xacro:property\s+name=["']([^"']+)["']\s+value=["']([^"']*)["']\s*\/>/g;

    let match: RegExpExecArray | null;
    while ((match = propRegex.exec(content)) !== null) {
        const name = match[1];
        let value = match[2];
        // Resolve any ${} in the value
        value = substituteVariables(value, ctx);
        ctx.properties.set(name, value);
    }

    // Also match block-style properties: <xacro:property name="...">value</xacro:property>
    const blockPropRegex = /<xacro:property\s+name=["']([^"']+)["']>([^<]*)<\/xacro:property>/g;
    while ((match = blockPropRegex.exec(content)) !== null) {
        const name = match[1];
        let value = match[2].trim();
        value = substituteVariables(value, ctx);
        ctx.properties.set(name, value);
    }
}

/**
 * Parse xacro:macro definitions
 */
function parseMacros(content: string, ctx: XacroContext): void {
    // Match <xacro:macro name="..." params="...">...</xacro:macro>
    const macroRegex = /<xacro:macro\s+name=["']([^"']+)["']\s+params=["']([^"']*)["']\s*>([\s\S]*?)<\/xacro:macro>/g;

    let match: RegExpExecArray | null;
    while ((match = macroRegex.exec(content)) !== null) {
        const name = match[1];
        const paramsStr = match[2];
        const body = match[3];

        // Parse params - handle default values like "param:=default"
        const params = paramsStr.split(/\s+/).filter((param) => param.length > 0);

        ctx.macros.set(name, { params, body });
    }
}

/**
 * Substitute ${...} variables
 */
function substituteVariables(content: string, ctx: XacroContext): string {
    // Replace $(arg name) with arg value
    content = content.replace(/\$\(arg\s+([^)]+)\)/g, (_, name) => {
        const argName = name.trim();
        if (ctx.args[argName] !== undefined) {
            return ctx.args[argName];
        }
        // Check if there's a default from xacro:arg
        return ctx.properties.get(argName) || `$(arg ${argName})`;
    });

    // Replace ${...} expressions
    content = content.replace(/\$\{([^}]+)\}/g, (match, expr) => {
        const trimmedExpr = expr.trim();

        // Simple variable lookup
        if (ctx.properties.has(trimmedExpr)) {
            return ctx.properties.get(trimmedExpr)!;
        }

        // Check args
        if (ctx.args[trimmedExpr] !== undefined) {
            return ctx.args[trimmedExpr];
        }

        // Try to evaluate simple expressions
        try {
            // Handle simple math expressions
            const numericExpr = trimmedExpr
                .replace(/(\w+)/g, (identifier: string) => {
                    if (ctx.properties.has(identifier)) {
                        return ctx.properties.get(identifier)!;
                    }
                    if (ctx.args[identifier] !== undefined) {
                        return ctx.args[identifier];
                    }
                    return identifier;
                });

            // Only evaluate if it looks like a safe numeric expression
            if (/^[-+*/\s\d.()]+$/.test(numericExpr)) {
                const result = Function(`"use strict"; return (${numericExpr})`)();
                if (typeof result === 'number' && !isNaN(result)) {
                    return String(result);
                }
            }
        } catch {
            // Keep original if evaluation fails
        }

        // Return original if we can't resolve
        return match;
    });

    return content;
}

function normalizePath(path: string): string {
    const slashNormalized = path.replace(/\\/g, '/').replace(/\/+/g, '/').trim();
    const parts = slashNormalized.split('/').filter(Boolean);
    const resolved: string[] = [];

    for (const part of parts) {
        if (part === '.') continue;
        if (part === '..') {
            resolved.pop();
            continue;
        }
        resolved.push(part);
    }

    return resolved.join('/');
}

/**
 * Find a file in the file map with fuzzy path matching
 */
function findFileInMap(filename: string, ctx: XacroContext): string | null {
    const resolvedFilename = substituteVariables(filename, ctx).trim();

    // Extract package name and relative path from $(find package)/path
    const findMatch = resolvedFilename.match(/\$\(find\s+([^)]+)\)(.*)$/);
    let packageName = '';
    let relativePath = resolvedFilename;

    if (findMatch) {
        packageName = findMatch[1].trim();
        relativePath = findMatch[2] || '';
    }

    // Remove leading slash
    relativePath = normalizePath(relativePath.replace(/^\//, ''));
    const normalizedBasePath = normalizePath(ctx.basePath);

    const fileMapKeys = Object.keys(ctx.fileMap);
    const normalizedKeys = fileMapKeys.map((key) => ({
        original: key,
        normalized: normalizePath(key),
    }));

    // Strategy 1: Look for package/relativePath pattern in file map keys
    if (packageName) {
        const searchPattern = normalizePath(
            relativePath ? `${packageName}/${relativePath}` : packageName
        );

        for (const key of normalizedKeys) {
            // Match paths like "workspace/pkg_name/path/to/file.xacro"
            // when searching for "pkg_name/path/to/file.xacro"
            if (key.normalized === searchPattern || key.normalized.endsWith(`/${searchPattern}`)) {
                return key.original;
            }
        }

        // If package is explicitly requested and not found, don't fall back
        // to fuzzy package-agnostic matching (prevents circular self-include).
        return null;
    }

    // Strategy 2: Try relative to base path
    if (normalizedBasePath && relativePath) {
        const baseParts = normalizedBasePath.split('/').filter(Boolean);
        for (let i = baseParts.length; i >= 0; i--) {
            const prefix = baseParts.slice(0, i).join('/');
            const tryPath = normalizePath(prefix ? `${prefix}/${relativePath}` : relativePath);
            const found = normalizedKeys.find((key) => key.normalized === tryPath);
            if (found) {
                return found.original;
            }
        }
    }

    // Strategy 3: Fuzzy search - look for files ending with the relative path
    if (relativePath) {
        for (const key of normalizedKeys) {
            if (key.normalized === relativePath || key.normalized.endsWith('/' + relativePath)) {
                return key.original;
            }
        }
    }

    // Strategy 4: Search by filename only as last resort
    const justFilename = relativePath.split('/').pop() || '';
    if (justFilename && justFilename.includes('.')) {
        for (const key of normalizedKeys) {
            if (key.normalized.endsWith('/' + justFilename) || key.normalized === justFilename) {
                return key.original;
            }
        }
    }

    return null;
}

/**
 * Process xacro:include elements
 */
function processIncludes(content: string, ctx: XacroContext): string {
    // Match both self-closing and block-style include tags.
    const includeRegex = /<xacro:include\s+filename=["']([^"']+)["']\s*(?:\/>|>\s*<\/xacro:include>)/g;

    return content.replace(includeRegex, (_match, filename) => {
        const resolvedFilename = substituteVariables(filename, ctx);
        const foundPath = findFileInMap(resolvedFilename, ctx);

        if (foundPath && ctx.fileMap[foundPath]) {
            const normalizedFoundPath = normalizePath(foundPath);
            if (ctx.includeStack.includes(normalizedFoundPath)) {
                console.warn(`[Xacro] Circular include detected: ${resolvedFilename}`);
                return `<!-- Circular include ignored: ${resolvedFilename} -->`;
            }

            // Recursively process the included file
            let includedContent = ctx.fileMap[foundPath];
            includedContent = preprocessXML(includedContent);

            // Update base path for nested includes
            const oldBasePath = ctx.basePath;
            const pathParts = normalizedFoundPath.split('/');
            pathParts.pop(); // Remove filename
            ctx.basePath = pathParts.join('/');
            ctx.includeStack.push(normalizedFoundPath);

            try {
                // Parse properties and macros from included file
                parseProperties(includedContent, ctx);
                parseMacros(includedContent, ctx);

                // Process nested includes
                includedContent = processIncludes(includedContent, ctx);
            } finally {
                ctx.includeStack.pop();
                ctx.basePath = oldBasePath;
            }

            // Remove robot tags from included content to avoid nesting
            includedContent = includedContent
                .replace(/<\?xml[^?]*\?>/g, '')
                .replace(/<robot[^>]*>/g, '')
                .replace(/<\/robot>/g, '');

            return includedContent;
        }

        // If file not found, return empty (or could return a comment)
        console.warn(`[Xacro] Include file not found: ${resolvedFilename}`);
        return `<!-- Include not found: ${resolvedFilename} -->`;
    });
}

/**
 * Expand macro calls
 */
function expandMacros(content: string, ctx: XacroContext): string {
    // Match <xacro:macroname ... /> or <xacro:macroname ...>...</xacro:macroname>
    for (const [macroName, macroDef] of ctx.macros) {
        // Self-closing macro calls
        const selfClosingRegex = new RegExp(
            `<xacro:${macroName}([^/>]*)/>`,
            'g'
        );

        content = content.replace(selfClosingRegex, (_match, attrsStr) => {
            return expandMacroCall(macroName, attrsStr, '', macroDef, ctx);
        });

        // Block macro calls
        const blockRegex = new RegExp(
            `<xacro:${macroName}([^>]*)>([\\s\\S]*?)</xacro:${macroName}>`,
            'g'
        );

        content = content.replace(blockRegex, (_match, attrsStr, innerContent) => {
            return expandMacroCall(macroName, attrsStr, innerContent, macroDef, ctx);
        });
    }

    return content;
}

/**
 * Expand a single macro call
 */
function expandMacroCall(
    _macroName: string,
    attrsStr: string,
    innerContent: string,
    macroDef: { params: string[], body: string },
    ctx: XacroContext
): string {
    // Parse attributes
    const attrs: Map<string, string> = new Map();
    const attrRegex = /(\w+)=["']([^"']*)["']/g;
    let match: RegExpExecArray | null;
    while ((match = attrRegex.exec(attrsStr)) !== null) {
        attrs.set(match[1], match[2]);
    }

    // Create local context with macro parameters
    const localCtx: XacroContext = {
        ...ctx,
        properties: new Map(ctx.properties)
    };

    // Set parameter values
    for (const param of macroDef.params) {
        // Handle default values (param:=default or param:=^)
        const [paramName, defaultValue] = param.split(':=');
        const cleanName = paramName.replace(/[*]$/, ''); // Remove block param marker

        if (attrs.has(cleanName)) {
            localCtx.properties.set(cleanName, attrs.get(cleanName)!);
        } else if (defaultValue !== undefined && defaultValue !== '^') {
            localCtx.properties.set(cleanName, defaultValue);
        }
    }

    // Substitute variables in macro body
    let expandedBody = macroDef.body;
    expandedBody = substituteVariables(expandedBody, localCtx);

    // Replace ${*} or any block content placeholder with inner content
    expandedBody = expandedBody.replace(/\$\{\*\}/g, innerContent);

    return expandedBody;
}

/**
 * Process xacro:if and xacro:unless conditionals
 */
function processConditionals(content: string, ctx: XacroContext): string {
    const isTruthy = (rawCondition: string): boolean => {
        const value = substituteVariables(rawCondition, ctx).trim();

        // If unresolved xacro syntax remains, treat as false in browser fallback mode.
        if (/\$\(|\$\{/.test(value)) {
            return false;
        }

        const normalized = value.replace(/^['"]|['"]$/g, '').trim().toLowerCase();
        if (!normalized) return false;

        return !['false', '0', 'none', 'no', 'off'].includes(normalized);
    };

    // Process xacro:if
    const ifRegex = /<xacro:if\s+value=["']([^"']+)["']>([\s\S]*?)<\/xacro:if>/g;
    content = content.replace(ifRegex, (_match, conditionExpr, body) => {
        return isTruthy(conditionExpr) ? body : '';
    });

    // Process xacro:unless
    const unlessRegex = /<xacro:unless\s+value=["']([^"']+)["']>([\s\S]*?)<\/xacro:unless>/g;
    content = content.replace(unlessRegex, (_match, conditionExpr, body) => {
        return isTruthy(conditionExpr) ? '' : body;
    });

    return content;
}

/**
 * Remove xacro-specific elements that shouldn't be in final output
 */
function cleanupXacroElements(content: string): string {
    // Remove xacro:property definitions
    content = content.replace(/<xacro:property[^>]*\/>/g, '');
    content = content.replace(/<xacro:property[^>]*>[\s\S]*?<\/xacro:property>/g, '');

    // Remove xacro:arg definitions
    content = content.replace(/<xacro:arg[^>]*\/>/g, '');

    // Remove xacro:macro definitions (they've been used for expansion)
    content = content.replace(/<xacro:macro[^>]*>[\s\S]*?<\/xacro:macro>/g, '');

    // Remove remaining unprocessed xacro elements
    content = content.replace(/<xacro:[^>]*\/>/g, '');
    content = content.replace(/<xacro:[^>]*>[\s\S]*?<\/xacro:[^>]*>/g, '');

    // Clean up xmlns:xacro attributes
    content = content.replace(/\s*xmlns:xacro="[^"]*"/g, '');

    // Clean up empty lines
    content = content.replace(/\n\s*\n\s*\n/g, '\n\n');

    return content;
}

/**
 * Process xacro content and convert to URDF
 */
export function processXacro(
    content: string,
    args: XacroArgs = {},
    fileMap: XacroFileMap = {},
    basePath: string = ''
): string {
    // Preprocess XML
    content = preprocessXML(content);

    // Initialize context
    const ctx: XacroContext = {
        properties: new Map(),
        macros: new Map(),
        args,
        fileMap,
        basePath: normalizePath(basePath),
        includeStack: []
    };

    // Parse default args from xacro:arg elements
    const defaultArgs = parseXacroArgs(content);
    for (const [name, value] of defaultArgs) {
        if (ctx.args[name] === undefined) {
            ctx.args[name] = value;
        }
    }

    // Multiple passes to handle nested includes and macros
    let prevContent = '';
    let iterations = 0;
    const maxIterations = 10; // Prevent infinite loops

    while (content !== prevContent && iterations < maxIterations) {
        prevContent = content;
        iterations++;

        // Parse properties
        parseProperties(content, ctx);

        // Parse macros
        parseMacros(content, ctx);

        // Process includes
        content = processIncludes(content, ctx);

        // Substitute variables
        content = substituteVariables(content, ctx);

        // Expand macros
        content = expandMacros(content, ctx);

        // Process conditionals
        content = processConditionals(content, ctx);
    }

    // Final cleanup
    content = cleanupXacroElements(content);

    // Convert package:// paths to relative paths for browser compatibility
    content = content.replace(/package:\/\/([^\/]+)\/([^"'<>\s]+)/g, (_match, pkg, path) => {
        // Try to find the actual file in the file map
        const pathsToTry = [
            `${pkg}/${path}`,
            path,
            path.split('/').pop() || ''
        ];

        for (const tryPath of pathsToTry) {
            if (ctx.fileMap[tryPath]) {
                return tryPath;
            }
        }

        // Search for matching path in file map
        const fileMapKeys = Object.keys(ctx.fileMap);
        for (const key of fileMapKeys) {
            if (key.endsWith(path) || key.endsWith('/' + path)) {
                return key;
            }
        }

        // Return just the relative path (mesh loader will handle it)
        return path;
    });

    // Ensure proper XML structure
    if (!content.includes('<robot')) {
        content = `<robot name="xacro_robot">${content}</robot>`;
    }

    return content;
}

/**
 * Parse xacro content and return RobotState
 */
export function parseXacro(
    content: string,
    args: XacroArgs = {},
    fileMap: XacroFileMap = {},
    basePath: string = ''
): RobotState | null {
    try {
        const urdfContent = processXacro(content, args, fileMap, basePath);
        return parseURDF(urdfContent);
    } catch (error) {
        console.error('[Xacro Parser] Failed to parse xacro:', error);
        return null;
    }
}

/**
 * Extract required xacro:arg names from content
 */
export function getXacroArgs(content: string): { name: string, defaultValue: string }[] {
    const args: { name: string, defaultValue: string }[] = [];
    const argRegex = /<xacro:arg\b([^>]*?)\/>/g;

    let match: RegExpExecArray | null;
    while ((match = argRegex.exec(content)) !== null) {
        const attrs = match[1];
        const nameMatch = attrs.match(/\bname=["']([^"']+)["']/);
        const defaultMatch = attrs.match(/\bdefault=["']([^"']*)["']/);
        if (nameMatch && defaultMatch) {
            args.push({ name: nameMatch[1], defaultValue: defaultMatch[1] });
        }
    }

    return args;
}
