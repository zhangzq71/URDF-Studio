import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  GENERATION_PROMPT_PLACEHOLDERS,
  GENERATION_SYSTEM_PROMPT_TEMPLATE,
  getGenerationSystemPrompt,
  getInspectionSystemPrompt,
  INSPECTION_PROMPT_PLACEHOLDERS,
  INSPECTION_SYSTEM_PROMPT_TEMPLATES,
} from './prompts.ts';
import { AI_PROMPT_TEMPLATES } from './aiPromptTemplates.generated.ts';

const promptMarkdownSource = fs.readFileSync(new URL('./aiPromptTemplates.md', import.meta.url), 'utf8');

const extractPromptFromMarkdown = (id: string): string => {
  const pattern = new RegExp(`<!-- PROMPT: ${id} -->\\n([\\s\\S]*?)\\n<!-- \\/PROMPT -->`, 'm');
  const match = promptMarkdownSource.match(pattern);
  assert.ok(match, `Prompt section "${id}" should exist in aiPromptTemplates.md`);
  return match[1].trim();
};

test('markdown prompt source documents the editable sections and placeholders for maintainers', () => {
  assert.match(promptMarkdownSource, /^# AI Prompt Templates/m);
  assert.match(promptMarkdownSource, /^## Editable Sections/m);
  assert.match(promptMarkdownSource, /`generation`/);
  assert.match(promptMarkdownSource, /`inspection\.en`/);
  assert.match(promptMarkdownSource, /`inspection\.zh`/);
  assert.match(promptMarkdownSource, /^## Placeholders/m);
  assert.match(promptMarkdownSource, /`__ROBOT_CONTEXT__`/);
  assert.match(promptMarkdownSource, /`__MOTOR_LIBRARY_CONTEXT__`/);
  assert.match(promptMarkdownSource, /`__CRITERIA_DESCRIPTION__`/);
  assert.match(promptMarkdownSource, /`__INSPECTION_NOTES__`/);
  assert.match(promptMarkdownSource, /`__LANGUAGE_INSTRUCTION__`/);
});

test('markdown prompt sections use structured subsection headings for easier editing', () => {
  const generationPrompt = extractPromptFromMarkdown('generation');
  const inspectionEnPrompt = extractPromptFromMarkdown('inspection.en');
  const inspectionZhPrompt = extractPromptFromMarkdown('inspection.zh');

  assert.match(generationPrompt, /^## Role/m);
  assert.match(generationPrompt, /^## Context/m);
  assert.match(generationPrompt, /^## Rules/m);

  assert.match(inspectionEnPrompt, /^## Role/m);
  assert.match(inspectionEnPrompt, /^## Input Context/m);
  assert.match(inspectionEnPrompt, /^## Output Contract/m);
  assert.match(inspectionEnPrompt, /^## Rules/m);

  assert.match(inspectionZhPrompt, /^## 角色/m);
  assert.match(inspectionZhPrompt, /^## 输入上下文/m);
  assert.match(inspectionZhPrompt, /^## 输出契约/m);
  assert.match(inspectionZhPrompt, /^## 规则/m);
});

test('generated prompt module stays in sync with the single markdown source of truth', () => {
  assert.equal(AI_PROMPT_TEMPLATES.generation, extractPromptFromMarkdown('generation'));
  assert.equal(AI_PROMPT_TEMPLATES.inspection.en, extractPromptFromMarkdown('inspection.en'));
  assert.equal(AI_PROMPT_TEMPLATES.inspection.zh, extractPromptFromMarkdown('inspection.zh'));
});

test('generation prompt template lives in a standalone config module', () => {
  assert.equal(typeof GENERATION_SYSTEM_PROMPT_TEMPLATE, 'string');
  assert.match(GENERATION_SYSTEM_PROMPT_TEMPLATE, /You are an expert Robotics Engineer and URDF Studio Expert/);
  assert.match(GENERATION_SYSTEM_PROMPT_TEMPLATE, new RegExp(GENERATION_PROMPT_PLACEHOLDERS.robot));
  assert.match(GENERATION_SYSTEM_PROMPT_TEMPLATE, new RegExp(GENERATION_PROMPT_PLACEHOLDERS.motorLibrary));
});

test('getGenerationSystemPrompt keeps the existing context injection contract', () => {
  const prompt = getGenerationSystemPrompt({
    robot: { name: 'demo_bot' },
    motorLibrary: [{ brand: 'Unitree' }],
  });

  assert.match(prompt, /demo_bot/);
  assert.match(prompt, /Unitree/);
  assert.match(prompt, /If the user asks for a \*new\* robot, generate a complete new structure/);
  assert.match(prompt, /For hardware changes, use the exact 'motorType' names from the library/);
});

test('inspection prompt templates live in a standalone config module', () => {
  assert.equal(typeof INSPECTION_SYSTEM_PROMPT_TEMPLATES.en, 'string');
  assert.equal(typeof INSPECTION_SYSTEM_PROMPT_TEMPLATES.zh, 'string');
  assert.match(INSPECTION_SYSTEM_PROMPT_TEMPLATES.en, /You are an expert URDF Robot Inspector/);
  assert.match(INSPECTION_SYSTEM_PROMPT_TEMPLATES.zh, /你是一位专业的URDF机器人检查专家/);
  assert.match(
    INSPECTION_SYSTEM_PROMPT_TEMPLATES.en,
    new RegExp(INSPECTION_PROMPT_PLACEHOLDERS.criteriaDescription),
  );
  assert.match(
    INSPECTION_SYSTEM_PROMPT_TEMPLATES.en,
    new RegExp(INSPECTION_PROMPT_PLACEHOLDERS.inspectionNotes),
  );
  assert.match(
    INSPECTION_SYSTEM_PROMPT_TEMPLATES.zh,
    new RegExp(INSPECTION_PROMPT_PLACEHOLDERS.criteriaDescription),
  );
  assert.match(
    INSPECTION_SYSTEM_PROMPT_TEMPLATES.zh,
    new RegExp(INSPECTION_PROMPT_PLACEHOLDERS.inspectionNotes),
  );
});

test('getInspectionSystemPrompt injects english criteria without changing the JSON contract', () => {
  const criteriaDescription = 'spec.robot_root_contract';
  const inspectionNotes = '**Source-Format Notes:**\n- MJCF summary: 2 sites';
  const prompt = getInspectionSystemPrompt('en', { criteriaDescription, inspectionNotes });

  assert.match(prompt, /spec\.robot_root_contract/);
  assert.match(prompt, /Source-Format Notes/);
  assert.doesNotMatch(prompt, new RegExp(INSPECTION_PROMPT_PLACEHOLDERS.criteriaDescription));
  assert.doesNotMatch(prompt, new RegExp(INSPECTION_PROMPT_PLACEHOLDERS.inspectionNotes));
  assert.match(prompt, /Return a pure JSON object/);
  assert.match(prompt, /Each issue MUST include 'category' and 'itemId'/);
});

test('getInspectionSystemPrompt injects chinese criteria without changing the JSON contract', () => {
  const criteriaDescription = 'spec.robot_root_contract';
  const inspectionNotes = '**源格式附加说明:**\n- MJCF 摘要：2 个 site';
  const prompt = getInspectionSystemPrompt('zh', { criteriaDescription, inspectionNotes });

  assert.match(prompt, /spec\.robot_root_contract/);
  assert.match(prompt, /源格式附加说明/);
  assert.doesNotMatch(prompt, new RegExp(INSPECTION_PROMPT_PLACEHOLDERS.criteriaDescription));
  assert.doesNotMatch(prompt, new RegExp(INSPECTION_PROMPT_PLACEHOLDERS.inspectionNotes));
  assert.match(prompt, /返回一个纯JSON对象/);
  assert.match(prompt, /每个问题必须包含与上述标准匹配的 'category' 和 'itemId' 字段/);
});
