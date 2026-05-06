// Transforms `import.meta.env.X` -> `process.env.X` for the Jest test
// environment. Vite handles this natively at build time; this plugin is
// only loaded when babel runs (i.e. via babel-jest in the test pipeline).
module.exports = function importMetaEnvPlugin({ types: t }) {
  return {
    visitor: {
      MetaProperty(path) {
        // import.meta — replace the whole MetaProperty with `process.env`
        // when its parent access is `.env.SOMETHING` or `.env`.
        if (
          path.node.meta?.name === 'import' &&
          path.node.property?.name === 'meta'
        ) {
          const parent = path.parentPath;
          if (
            parent.isMemberExpression() &&
            parent.node.property.type === 'Identifier' &&
            parent.node.property.name === 'env'
          ) {
            // import.meta.env -> process.env
            parent.replaceWith(
              t.memberExpression(t.identifier('process'), t.identifier('env'))
            );
          }
        }
      },
    },
  };
};
