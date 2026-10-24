import { readFileSync } from "node:fs";

const PREFIX = "motoark-demo-";

// The Cloudflare account is shared with another product, so any Worker or
// container outside our prefix must stop the deploy.
function stripJsonc(text) {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inString) {
      out += c;
      if (c === "\\") out += text[++i];
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
    } else {
      out += c;
    }
  }
  return out.replace(/,(\s*[\]}])/g, "$1");
}

function namesIn(scope, label) {
  const found = [{ where: `${label} name`, value: scope.name }];
  for (const [index, container] of (scope.containers ?? []).entries()) {
    found.push({ where: `${label} containers[${index}].name`, value: container.name });
  }
  return found;
}

function collect(config) {
  const found = namesIn(config, "top level");
  for (const [env, scope] of Object.entries(config.env ?? {})) {
    found.push(...namesIn(scope, `env.${env}`));
  }
  return found;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: check-names.mjs <wrangler.jsonc>...");
  process.exit(2);
}

let failed = false;
for (const file of files) {
  const config = JSON.parse(stripJsonc(readFileSync(file, "utf8")));
  for (const { where, value } of collect(config)) {
    if (value === undefined) {
      if (where === "top level name") {
        console.error(`FAIL ${file}: ${where} is missing`);
        failed = true;
      }
    } else if (typeof value !== "string" || !value.startsWith(PREFIX)) {
      console.error(`FAIL ${file}: ${where} "${value}" does not start with "${PREFIX}"`);
      failed = true;
    } else {
      console.log(`ok   ${file}: ${where} "${value}"`);
    }
  }
}
process.exit(failed ? 1 : 0);
