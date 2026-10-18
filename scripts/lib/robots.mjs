export function parseRobots(text) {
  let active = false;
  const rules = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    const match = /^([^:]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();
    if (key === 'user-agent') { active = value === '*'; continue; }
    if (active && ['allow', 'disallow'].includes(key) && value) {
      if (!value.startsWith('/')) throw new Error('Robots paths must be absolute paths.');
      rules.push({ allow: key === 'allow', pattern: value });
    }
  }
  return rules;
}

export function robotsAllowed(rules, path) {
  let best = -1;
  let allowed = true;
  for (const rule of rules) {
    const end = rule.pattern.endsWith('$');
    const pattern = end ? rule.pattern.slice(0, -1) : rule.pattern;
    const expression = new RegExp('^' + pattern.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (end ? '$' : ''));
    if (!expression.test(path)) continue;
    const specificity = pattern.replaceAll('*', '').length;
    if (specificity > best || (specificity === best && rule.allow)) {
      best = specificity;
      allowed = rule.allow;
    }
  }
  return allowed;
}
