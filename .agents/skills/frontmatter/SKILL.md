---
name: frontmatter
description: Pi skill frontmatter reference and template. Use when creating or reviewing project skills so they conform to Pi's Agent Skills frontmatter rules, naming constraints, and description requirements.
compatibility: Intended for Pi skills stored in .agents/skills, .pi/skills, or compatible Agent Skills directories.
---

# Skill Frontmatter

## Purpose

Use this skill when creating or reviewing `SKILL.md` files for Pi.

## Required Frontmatter

Every skill must begin with frontmatter like:

```yaml
---
name: example-skill
description: Specific description of what the skill does and when to use it.
---
```

## Rules

### `name`

- required
- 1-64 characters
- lowercase letters, numbers, hyphens only
- no leading or trailing hyphens
- no consecutive hyphens
- must match the parent directory name

### `description`

- required
- max 1024 characters
- should clearly say what the skill does and when to use it
- missing descriptions prevent the skill from loading

### Optional fields

- `license`
- `compatibility`
- `metadata`
- `allowed-tools`
- `disable-model-invocation`

Unknown frontmatter fields are ignored, but keeping frontmatter minimal is better.

## Recommended Template

````markdown
---
name: skill-name
description: What this skill does and when to use it. Be specific.
compatibility: Optional environment or repo constraints.
---

# Skill Name

## Use When

- condition 1
- condition 2

## Workflow

1. Step one.
2. Step two.
3. Step three.

## References

- `relative/path/to/file`
````

## Review Checklist

Before finalizing a skill:

1. Confirm the directory name matches `name` exactly.
2. Confirm the description is specific enough for the model to load it appropriately.
3. Confirm the skill uses relative references where possible.
4. Keep instructions focused on a real repeatable workflow, not a task log.

## Source Reference

Pi frontmatter rules are documented in:

- `~/development/pi-mono/packages/coding-agent/docs/skills.md`
