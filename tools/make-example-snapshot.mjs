// Writes a small synthetic ds-snapshot: real structure, invented names. Built as
// a folder so the skill's own validator can check it, then packed to a bundle.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
mkdirSync(join(root, "tokens"), { recursive: true });
const S = "https://www.designtokens.org/schemas/2025.10/format.json";
const NS = "io.github.tiagopedras-twinkl.ds-snapshot";
const w = (p, o) => writeFileSync(join(root, p), JSON.stringify(o, null, 2) + "\n");
const ext = (figmaName, figmaType) => ({ [NS]: { figmaName, figmaType } });
const colour = (components, hex, figmaName) => ({
  $type: "color",
  $value: { colorSpace: "srgb", components, alpha: 1, hex },
  $extensions: ext(figmaName, "COLOR"),
});
const size = (value, figmaName) => ({
  $type: "dimension",
  $value: { value, unit: "px" },
  $extensions: ext(figmaName, "FLOAT"),
});
const ref = (path, figmaName) => ({ $type: "color", $value: `{${path}}`, $extensions: ext(figmaName, "COLOR") });

// --- primitives: the raw-value layer, one mode ---
const primitives = {
  $schema: S,
  ink: {
    "100": colour([0.9294, 0.9451, 0.9608], "#edf1f5", "ink/100"),
    "900": colour([0.0784, 0.1059, 0.1451], "#141b25", "ink/900"),
  },
  sky: {
    "500": colour([0.1451, 0.3882, 0.9216], "#2563eb", "sky/500"),
    "700": colour([0.1137, 0.3059, 0.7255], "#1d4eb9", "sky/700"),
  },
};

// --- tokens: two themes, aliasing the primitives ---
const tokenTree = (theme) => ({
  $schema: S,
  background: {
    page: ref(theme === "light" ? "ink.100" : "ink.900", "background/page"),
    primary: ref(theme === "light" ? "sky.500" : "sky.700", "background/primary"),
  },
  space: {
    gap: size(8, "space/gap"),
    inset: size(16, "space/inset"),
  },
  text: {
    body: ref(theme === "light" ? "ink.900" : "ink.100", "text/body"),
  },
});

const spacing = {
  $schema: S,
  radius: { pill: size(999, "radius/pill") },
};

w("tokens.json", {
  $schema: S,
  background: tokenTree("light").background,
  ink: primitives.ink,
  radius: spacing.radius,
  sky: primitives.sky,
  space: tokenTree("light").space,
  text: tokenTree("light").text,
});
w("tokens/primitives.value.json", primitives);
w("tokens/shape.value.json", spacing);
w("tokens/tokens.dark.json", tokenTree("dark"));
w("tokens/tokens.light.json", tokenTree("light"));

// --- typography ---
const style = (figmaName, styleId, fontSize, fontWeight, fontStyle) => ({
  $type: "typography",
  $value: {
    fontFamily: "Example Sans",
    fontSize: { value: fontSize, unit: "px" },
    fontWeight,
    letterSpacing: { value: 0, unit: "px" },
    lineHeight: 1.5,
  },
  $extensions: {
    [NS]: {
      figmaName,
      figmaStyleId: styleId,
      figmaFontStyle: fontStyle,
      figmaLineHeight: { unit: "PERCENT", value: 150 },
      figmaLetterSpacing: { unit: "PERCENT", value: 0 },
    },
  },
});
w("typography.json", {
  $schema: S,
  body: {
    base: style("body/base", "S:example0001", 16, 400, "Regular"),
    strong: style("body/strong", "S:example0002", 16, 700, "Bold"),
  },
  heading: {
    "level-1": style("heading/level 1", "S:example0003", 32, 700, "Bold"),
  },
});

// --- components ---
const component = (id, name, path, kind, variants, combos, description) => ({
  id,
  name,
  path,
  kind,
  source: "Example Library",
  variants,
  variantCombinations: combos,
  description,
  deprecated: /deprecated/i.test(`${name} ${description}`),
  figma: { nodeId: "1:2", key: "" },
});
w("components.json", {
  schemaVersion: "1.1.0",
  components: [
    component("actions/button", "Button", ["Actions"], "componentSet", { size: ["lg", "sm"], type: ["primary", "secondary"] }, 4, "The one interactive control."),
    component("actions/icon-button", "Icon button", ["Actions"], "componentSet", { size: ["lg", "sm"] }, 2, ""),
    component("banner", "Banner", [], "componentSet", { tone: ["info", "warning"] }, 2, ""),
    component("card", "Card", [], "componentSet", { elevated: ["false", "true"] }, 2, ""),
    component("divider", "Divider", [], "component", {}, 1, "Deprecated — use a Card instead."),
  ],
});

// --- dependencies ---
w("dependencies.json", {
  schemaVersion: "1.1.0",
  aliases: [
    { from: "background.page", to: "ink.900", mode: "dark" },
    { from: "background.page", to: "ink.100", mode: "light" },
    { from: "background.primary", to: "sky.700", mode: "dark" },
    { from: "background.primary", to: "sky.500", mode: "light" },
    { from: "text.body", to: "ink.100", mode: "dark" },
    { from: "text.body", to: "ink.900", mode: "light" },
  ],
  components: [
    {
      id: "actions/button",
      bindings: [
        { token: "background.primary", properties: ["fills"] },
        { token: "radius.pill", properties: ["bottomLeftRadius", "topLeftRadius"] },
        { token: "space.gap", properties: ["itemSpacing"] },
        { token: "space.inset", properties: ["paddingLeft", "paddingRight"] },
        { token: "text.body", properties: ["fills"] },
      ],
      typography: ["body.strong"],
      nests: [{ id: "actions/icon-button", count: 2 }],
      nestsUncaptured: [],
      unresolvedBindings: [],
    },
    {
      id: "actions/icon-button",
      bindings: [
        { token: "background.primary", properties: ["fills"] },
        { token: "radius.pill", properties: ["topLeftRadius"] },
      ],
      typography: [],
      nests: [],
      nestsUncaptured: [{ name: "ArrowRight", count: 2 }],
      unresolvedBindings: [],
    },
    {
      id: "banner",
      bindings: [
        { token: "background.page", properties: ["fills"] },
        { token: "space.inset", properties: ["paddingBottom", "paddingTop"] },
      ],
      typography: ["body.base"],
      nests: [{ id: "actions/button", count: 1 }],
      nestsUncaptured: [],
      unresolvedBindings: [{ figmaName: "Legacy/banner-tint", properties: ["fills"] }],
    },
    {
      id: "card",
      bindings: [
        { token: "background.page", properties: ["fills"] },
        { token: "space.inset", properties: ["paddingLeft", "paddingRight"] },
        { token: "text.body", properties: ["fills"] },
      ],
      typography: ["body.base", "heading.level-1"],
      nests: [{ id: "actions/button", count: 1 }, { id: "divider", count: 1 }],
      nestsUncaptured: [],
      unresolvedBindings: [],
    },
    {
      id: "divider",
      bindings: [{ token: "background.primary", properties: ["strokes"] }],
      typography: [],
      nests: [],
      nestsUncaptured: [],
      unresolvedBindings: [],
    },
  ],
});

// --- manifest ---
w("manifest.json", {
  schemaVersion: "1.1.0",
  generator: { skill: "ds-snapshot", skillVersion: "1.1.0" },
  exportedAt: "2026-01-01T00:00:00Z",
  spec: { designTokens: "2025.10" },
  source: {
    figmaFileName: "Example Library",
    figmaFileKey: "",
    figmaLastModified: "",
    transport: "desktop-bridge",
  },
  collections: [
    { id: "primitives", name: "Primitives", defaultMode: "Value", modes: ["Value"], variableCount: 4 },
    { id: "shape", name: "Shape", defaultMode: "Value", modes: ["Value"], variableCount: 1 },
    { id: "tokens", name: "Tokens", defaultMode: "light", modes: ["dark", "light"], variableCount: 5 },
  ],
  files: [
    { path: "components.json", kind: "components" },
    { path: "dependencies.json", kind: "dependencies" },
    { path: "tokens.json", kind: "tokens-default" },
    { path: "tokens/primitives.value.json", kind: "tokens-mode", collection: "Primitives", mode: "Value" },
    { path: "tokens/shape.value.json", kind: "tokens-mode", collection: "Shape", mode: "Value" },
    { path: "tokens/tokens.dark.json", kind: "tokens-mode", collection: "Tokens", mode: "dark" },
    { path: "tokens/tokens.light.json", kind: "tokens-mode", collection: "Tokens", mode: "light" },
    { path: "typography.json", kind: "typography" },
  ],
  counts: { variables: 10, typographyStyles: 3, components: 1, componentSets: 4 },
  dependencies: {
    captured: true,
    sources: [{ figmaFileName: "Example Library", figmaFileKey: "", componentsWalked: 5 }],
    counts: { bindings: 13, aliases: 6, nests: 4, nestsUncaptured: 1, typographyLinks: 4, unresolvedBindings: 1 },
  },
  notes: {
    nonStandardTypes: [],
    unmapped: [
      { kind: "alias", name: "tokens/tokens.dark.json (3 references)", reason: "cross-collection alias unresolvable in mode file" },
      { kind: "alias", name: "tokens/tokens.light.json (3 references)", reason: "cross-collection alias unresolvable in mode file" },
    ],
  },
});

console.log(`wrote an example snapshot to ${root}`);
