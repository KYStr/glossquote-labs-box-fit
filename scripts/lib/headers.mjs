const escapeRegex = value => value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

export function parseHeaders(text) {
  const rules = [];
  let rule;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      if (!line.startsWith('/') || /\s/.test(line)) throw new Error('Invalid header route.');
      rule = { pattern: line, operations: [] };
      rules.push(rule);
    } else {
      if (!rule) throw new Error('Header without a route.');
      const directive = line.trim();
      if (directive.startsWith('! ')) {
        const name = directive.slice(2).toLowerCase();
        if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Invalid removed header.');
        rule.operations.push({ remove: true, name });
      } else {
        const match = /^([A-Za-z0-9-]+): (.+)$/.exec(directive);
        if (!match) throw new Error('Invalid header assignment.');
        rule.operations.push({ remove: false, name: match[1].toLowerCase(), value: match[2] });
      }
    }
  }
  return rules;
}

export function applyHeaders(rules, path) {
  const result = {};
  for (const rule of rules) {
    const expression = new RegExp('^' + rule.pattern.split('*').map(escapeRegex).join('.*') + '$');
    if (!expression.test(path)) continue;
    for (const operation of rule.operations) {
      if (operation.remove) delete result[operation.name];
      else result[operation.name] = result[operation.name] === undefined ? operation.value : `${result[operation.name]}, ${operation.value}`;
    }
  }
  return result;
}
