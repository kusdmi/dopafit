import path from 'node:path';

const layers = ['shared', 'entities', 'features', 'pages', 'app'];
export const fsdRule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      direction: 'Import {{target}} violates the FSD layer direction.',
      slice:
        'Import {{target}} crosses isolated slices. Compose in a higher layer or expose a named entity @x API.',
    },
  },
  create(context) {
    const filename = context.filename.replaceAll('\\', '/');
    const marker = filename.lastIndexOf('/src/');
    if (marker < 0) return {};
    const [layer, slice] = filename.slice(marker + 5).split('/');
    if (!layers.includes(layer)) return {};
    const check = (node) => {
      const source = node.source?.value;
      if (typeof source !== 'string') return;
      let target;
      if (source.startsWith('@/')) target = source.slice(2);
      else if (source.startsWith('.'))
        target = path.relative(
          filename.slice(0, marker + 5),
          path.resolve(path.dirname(filename), source),
        );
      else return;
      const [targetLayer, targetSlice] = target.split('/');
      if (!layers.includes(targetLayer)) return;
      if (layers.indexOf(targetLayer) > layers.indexOf(layer))
        context.report({ node, messageId: 'direction', data: { target: source } });
      else if (
        layer === targetLayer &&
        !['shared', 'app'].includes(layer) &&
        slice !== targetSlice &&
        !(layer === 'entities' && target === `entities/${targetSlice}/@x/${slice}`)
      )
        context.report({ node, messageId: 'slice', data: { target: source } });
    };
    return { ImportDeclaration: check, ExportNamedDeclaration: check, ExportAllDeclaration: check };
  },
};
