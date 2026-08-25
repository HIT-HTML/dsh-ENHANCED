import { type Handler } from "./shared.js";
export declare const SKILL_NAME_RE: RegExp;
export declare const SKILL_ACTIONS: readonly ["list_skills", "read_skill", "add_skill", "edit_skill", "remove_skill", "install_skill", "install_skill_files"];
/**
 * Frontmatter of a SKILL.md, parsed as real YAML — block scalars included
 * (`description: >` with indented continuation lines), which a line-based
 * regex reads as the bare indicator ">".
 */
export declare function parseSkillDoc(raw: string): Record<string, unknown>;
export declare const handleSkills: Handler;
//# sourceMappingURL=skills.d.ts.map