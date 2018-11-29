#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const program = require('commander');
const { Source, buildSchema } = require('graphql');
const del = require('del');
const shell = require('shelljs');

program
  .option('--schemaFilePath [value]', 'path of your graphql schema file')
  .option('--destDirPath [value]', 'dir you want to store the generated queries')
  .option('--es6 [value]', 'environment for which queries are made')
  .parse(process.argv);

const { schemaFilePath, destDirPath, es6 } = program;

console.log('[gqlg]:', `Going to create 3 folders to store the queries inside path: ${process.cwd() + destDirPath}`);

// Make schema based on all .graphql and .gql files
function generateSchema(dir) {
  let newFile = '';

  const walk = function (dir) {
    const list = fs.readdirSync(dir);

    list.forEach((file) => {
      file = `${dir}/${file}`;
      const stat = fs.statSync(file);

      if (stat && stat.isDirectory()) {
        /* Recurse into a subdirectory */
        walk(file);
      } else {
        /* Is a file */
        const extension = file.split('.').pop();

        if (extension.includes('graphql') || extension.includes('gql')) {
          const currFile = fs.readFileSync(file, 'utf8');
          newFile += currFile;
        }
      }
    });
  };

  walk(dir);

  return newFile;
}

const schemaIsFile = fs.lstatSync(schemaFilePath).isFile();

const typeDef = schemaIsFile ? fs.readFileSync(schemaFilePath) : generateSchema(schemaFilePath);

const source = new Source(typeDef);
// const ast = parse(source);
const gqlSchema = buildSchema(source);

const addQueryDepthLimit = 100;
// schema.getType

/**
 * Cleans out getType() names to contain only the type name itself
 * @param name
 */
function cleanName(name) {
  return name.replace(/[[\]!]/g, '');
}

/**
 * Generate the query for the specified field
 * @param curName name of the current field
 * @param curParentType parent type of the current field
 * @param parentFields preceding parent field and type combinations
 */
function generateQuery(curName, curParentType) {
  let query = '';
  const hasArgs = false;
  const argTypes = []; // [{name: 'id', type: 'Int!'}]

  /**
   * Generate the query for the specified field
   * @param name name of the current field
   * @param parentType parent type of the current field
   * @param parentFields preceding parent field and type combinations
   * @param level current depth level of the current field
   */
  function generateFieldData(name, parentType, parentFields, level) {
    // console.log('Generating query for ', name, parentType);

    const tabSize = 4;
    const field = gqlSchema.getType(parentType).getFields()[name];

    const meta = {
      hasArgs: false,
    };

    // Start the query with the field name
    let fieldStr = ' '.repeat(level * tabSize) + field.name;

    // If the field has arguments, add them
    if (field.args && field.args.length) {
      meta.hasArgs = true;

      const argsList = field.args.reduce((acc, cur) => `${acc}, ${cur.name}: $${cur.name}`, '').substring(2);

      fieldStr += `(${argsList})`;

      field.args.forEach((arg) => {
        argTypes.push({
          name: `$${arg.name}`,
          type: arg.type,
        });
      });
    }

    // Retrieve the current field type
    const curTypeName = cleanName(field.type.inspect());
    const curType = gqlSchema.getType(curTypeName);

    // Don't add a field if it has been added in the query already.
    // This happens when there is a recursive field
    if (parentFields.filter(x => x.type === curTypeName).length) {
      return { query: '', meta: {} };
    }

    // Stop adding new fields once the specified level depth limit is reached
    if (level >= addQueryDepthLimit) {
      return { query: '', meta: {} };
    }

    // Get all the fields of the field type, if available
    const innerFields = curType.getFields && curType.getFields();
    let innerFieldsData = null;
    if (innerFields) {
      innerFieldsData = Object.keys(innerFields)
        .reduce((acc, cur) => {
          // Don't add a field if it has been added in the query already.
          // This happens when there is a recursive field
          if (parentFields.filter(x => x.name === cur && x.type === curTypeName).length) {
            return '';
          }

          const curInnerFieldData = generateFieldData(
            cur,
            curTypeName,
            [...parentFields, { name, type: curTypeName }],
            level + 1,
          );
          const curInnerFieldStr = curInnerFieldData.query;

          // Set the hasArgs meta if the inner field has args
          meta.hasArgs = meta.hasArgs || curInnerFieldData.meta.hasArgs;

          // Don't bother adding the field if there was nothing generated.
          // This should fix the empty line issue in the inserted queries
          if (!curInnerFieldStr) {
            return acc;
          }

          // Join all the fields together
          return `${acc}\n${curInnerFieldStr}`;
        }, '')
        .substring(1);
    }

    // Add the inner fields with braces if available
    if (innerFieldsData) {
      fieldStr += `{\n${innerFieldsData}\n`;
      fieldStr += `${' '.repeat(level * tabSize)}}`;
    }

    return { query: fieldStr, meta };
  }

  const fieldData = generateFieldData(curName, curParentType, [], 1);

  const argStr = argTypes.map(argType => `${argType.name}: ${argType.type}`).join(', ');

  // Add the root type of the query
  switch (curParentType) {
    case gqlSchema.getQueryType() && gqlSchema.getQueryType().name:
      query += `query ${curName}${argStr ? `(${argStr})` : ''}`;
      break;
    case gqlSchema.getMutationType() && gqlSchema.getMutationType().name:
      query += `mutation ${curName}${argStr ? `(${argStr})` : ''}`;
      break;
    case gqlSchema.getSubscriptionType() && gqlSchema.getSubscriptionType().name:
      query += `subscription ${curName}${argStr ? `(${argStr})` : ''}`;
      break;
    default:
      throw new Error('parentType is not one of mutation/query/subscription');
  }

  // Add the query fields
  query += `{\n${fieldData.query}\n}`;

  const meta = { ...fieldData.meta };

  // Update hasArgs option
  meta.hasArgs = hasArgs || meta.hasArgs;

  return { query, meta };
}

// process.env.PWD is the working directory when the process was started. This stays the same for the entire process.
// it can be problems with windows

// The process.cwd() method returns the current working directory of the Node.js process. In out case package.json
const mutationsFolder = path.join(process.cwd(), destDirPath, './mutations');
const queriesFolder = path.join(process.cwd(), destDirPath, './queries');
const subscriptionsFolder = path.join(process.cwd(), destDirPath, './subscriptions');

// remove all previosly generated files
del.sync(path.join(process.cwd(), destDirPath, './index.js'));
del.sync(mutationsFolder);
del.sync(queriesFolder);
del.sync(subscriptionsFolder);

// recusively create folders
shell.mkdir('-p', mutationsFolder);
shell.mkdir('-p', queriesFolder);
shell.mkdir('-p', subscriptionsFolder);

const indexJsStart = es6
  ? `
import gql from 'graphql-tag'

`
  : `
const fs = require('fs');
const path = require('path');

`;

let mutationExists = false;
let queryExists = false;
let subscriptionExists = false;

let indexJsExportAll = '';

if (gqlSchema.getMutationType()) {
  let mutationsIndexJs = indexJsStart;
  Object.keys(gqlSchema.getMutationType().getFields()).forEach((mutationType) => {
    const { query } = generateQuery(mutationType, 'Mutation');

    // Client environment doesn't use fs, path and module.exports
    if (es6) {
      mutationsIndexJs += `export const ${mutationType} = gql\`\n${query}\`;\n\n`;
    } else {
      fs.writeFileSync(path.join(mutationsFolder, `./${mutationType}.gql`), query);
      mutationsIndexJs += `module.exports.${mutationType} = fs.readFileSync(path.join(__dirname, '${mutationType}.gql'), 'utf8');\n`;
    }
  });

  fs.writeFileSync(path.join(mutationsFolder, 'index.js'), mutationsIndexJs);

  // Client fetching all exported mutations and storing them into mutations
  if (es6) {
    indexJsExportAll += "import * as mutations from './mutations';\n";
    mutationExists = true;
  } else {
    indexJsExportAll += "module.exports.mutations = require('./mutations');\n";
  }
} else {
  console.log('[gqlg warning]:', 'No mutation type found in your schema');
}

if (gqlSchema.getQueryType()) {
  let queriesIndexJs = indexJsStart;
  Object.keys(gqlSchema.getQueryType().getFields()).forEach((queryType) => {
    const { query } = generateQuery(queryType, 'Query');

    // Client environment doesn't use fs, path and module.exports
    if (es6) {
      queriesIndexJs += `export const ${queryType} = gql\`\n${query}\`;\n\n`;
    } else {
      fs.writeFileSync(path.join(queriesFolder, `./${queryType}.gql`), query);
      queriesIndexJs += `module.exports.${queryType} = fs.readFileSync(path.join(__dirname, '${queryType}.gql'), 'utf8');\n`;
    }
  });
  fs.writeFileSync(path.join(queriesFolder, 'index.js'), queriesIndexJs);

  if (es6) {
    indexJsExportAll += "import * as queries from './queries';\n";
    queryExists = true;
  } else {
    indexJsExportAll += "module.exports.queries = require('./queries');\n";
  }
} else {
  console.log('[gqlg warning]:', 'No query type found in your schema');
}

if (gqlSchema.getSubscriptionType()) {
  let subscriptionsIndexJs = indexJsStart;
  Object.keys(gqlSchema.getSubscriptionType().getFields()).forEach((subscriptionType) => {
    const { query } = generateQuery(subscriptionType, 'Subscription');

    if (es6) {
      subscriptionsIndexJs += `export const ${subscriptionType} = gql\`\n${query}\`;\n\n`;
    } else {
      fs.writeFileSync(path.join(subscriptionsFolder, `./${subscriptionType}.gql`), query);
      subscriptionsIndexJs += `module.exports.${subscriptionType} = fs.readFileSync(path.join(__dirname, '${subscriptionType}.gql'), 'utf8');\n`;
    }
  });
  fs.writeFileSync(path.join(subscriptionsFolder, 'index.js'), subscriptionsIndexJs);

  if (es6) {
    indexJsExportAll += "import * as subscriptions from './subscriptions';\n";
    subscriptionExists = true;
  } else {
    indexJsExportAll += "module.exports.subscriptions = require('./subscriptions');\n";
  }
} else {
  console.log('[gqlg warning]:', 'No subscription type found in your schema');
}

if (es6) {
  if (mutationExists) indexJsExportAll += 'export const mutation = mutations;\n';
  if (queryExists) indexJsExportAll += 'export const query = queries;\n';
  if (subscriptionExists) indexJsExportAll += 'export const subscription = subscriptions;\n';
}

fs.writeFileSync(path.join(process.cwd(), destDirPath, 'index.js'), indexJsExportAll);
