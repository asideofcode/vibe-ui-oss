/**
 * JSON Patch applicator for vibe-app-server history/entryUpdated.
 * Supports RFC6902 (add / remove / replace / move / copy / test) plus the
 * server's streaming extension: `append` (string concat or array push).
 */

function unescape(token) {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

function parsePath(path) {
  if (path === "") return [];
  if (!path.startsWith("/")) {
    throw new Error(`Invalid JSON Pointer: ${path}`);
  }
  return path.slice(1).split("/").map(unescape);
}

function getParent(doc, tokens) {
  let cur = doc;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const key = tokens[i];
    if (cur == null || !(key in Object(cur)) && !Array.isArray(cur)) {
      throw new Error(`Cannot resolve path at ${tokens.slice(0, i + 1).join("/")}`);
    }
    cur = cur[key];
  }
  return { parent: cur, key: tokens[tokens.length - 1] };
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function applyOp(doc, op) {
  const type = op.op;
  if (type === "test") {
    const tokens = parsePath(op.path);
    if (!tokens.length) {
      if (JSON.stringify(doc) !== JSON.stringify(op.value)) {
        throw new Error("JSON Patch test failed at root");
      }
      return doc;
    }
    const { parent, key } = getParent(doc, tokens);
    if (JSON.stringify(parent?.[key]) !== JSON.stringify(op.value)) {
      throw new Error(`JSON Patch test failed at ${op.path}`);
    }
    return doc;
  }

  if (type === "remove") {
    const tokens = parsePath(op.path);
    const { parent, key } = getParent(doc, tokens);
    if (Array.isArray(parent)) parent.splice(Number(key), 1);
    else delete parent[key];
    return doc;
  }

  if (type === "add" || type === "replace") {
    const tokens = parsePath(op.path);
    if (!tokens.length) {
      return clone(op.value);
    }
    const { parent, key } = getParent(doc, tokens);
    if (Array.isArray(parent)) {
      const idx = key === "-" ? parent.length : Number(key);
      if (type === "add") parent.splice(idx, 0, clone(op.value));
      else parent[idx] = clone(op.value);
    } else {
      parent[key] = clone(op.value);
    }
    return doc;
  }

  if (type === "append") {
    const tokens = parsePath(op.path);
    if (!tokens.length) {
      throw new Error("Cannot append at document root");
    }
    const { parent, key } = getParent(doc, tokens);
    const current = parent?.[key];
    if (typeof current === "string") {
      parent[key] = current + String(op.value ?? "");
    } else if (Array.isArray(current)) {
      if (Array.isArray(op.value)) parent[key] = current.concat(clone(op.value));
      else parent[key] = current.concat([clone(op.value)]);
    } else if (current == null) {
      parent[key] =
        typeof op.value === "string" || Array.isArray(op.value)
          ? clone(op.value)
          : String(op.value ?? "");
    } else {
      throw new Error(`Cannot append to ${typeof current} at ${op.path}`);
    }
    return doc;
  }

  if (type === "move" || type === "copy") {
    const fromTokens = parsePath(op.from);
    const { parent: fromParent, key: fromKey } = getParent(doc, fromTokens);
    const value = clone(fromParent[fromKey]);
    if (type === "move") {
      if (Array.isArray(fromParent)) fromParent.splice(Number(fromKey), 1);
      else delete fromParent[fromKey];
    }
    return applyOp(doc, { op: "add", path: op.path, value });
  }

  throw new Error(`Unsupported JSON Patch op: ${type}`);
}

export function applyJsonPatch(document, patch) {
  let doc = clone(document);
  for (const op of patch || []) {
    doc = applyOp(doc, op);
  }
  return doc;
}
