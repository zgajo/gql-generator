# gql-generator

Library originally created by timqian [`timqian`](https://github.com/timqian/gql-generator/)

Generate queries from graphql schema, used for writing api test. (EDIT: Added generating queries for client. [`Darko Pranjić`](https://github.com/zgajo/))

### UPDATE:

By [`Darko Pranjić`](https://github.com/zgajo/):

- Reading `.graphql` and `.gql` extensions.

- Possibility to send only folder name (schemaFilePath) in which are all graphql types, schema will be created accordingly.

- Fix for destinations path to store the generated queries on all OS. (It will be created from working directory of the Node.js process. In our case package.json parent)

- Library has been originally created for writing api tests, now has a feature for generating queries for client side.

## Example

```gql
# Sample schema
type Query {
  user(id: Int!): User!
}

type User {
  id: Int!
  username: String!
  email: String!
  createdAt: String!
}
```

```gql
# Sample query generated
query user($id: Int!) {
  user(id: $id) {
    id
    username
    email
    createdAt
  }
}
```

## Usage

```bash
# Install
npm install git+https://github.com/zgajo/gql-generator.git

# see the usage
gqlg --help

# Variables
--schemaFilePath - path of your graphql schema file
--destDirPath - dir you want to store the generated queries
--workingEnvironment - environment for which queries are made (server is default)

# Generate sample queries from schema file
gqlg --schemaFilePath ./example/sampleTypeDef.graphql --destDirPath ./example/output

#OR

# Generate sample queries from schema folder
gqlg --schemaFilePath ./example/ --destDirPath ./example/output
```

Now the queries generated from the [`sampleTypeDef.graphql`](./example/sampleTypeDef.graphql) can be found in the destDir: [`./example/output`](./example/output).

This tool generate 3 folders holding the queries: mutations, queries and subscriptions. And also `index.js` files to export the queries in each folder.

You can require the queries like this:

```js
// require all the queries
const queries = require('./example/output');
// require mutations only
const mutations = require('./example/output/mutations');

// sample content
console.log(queries.mutations.signup);
console.log(mutations.signup);
/*
mutation signup($username: String!, email: String!, password: String!){
  signup(username: $username, email: $email, password: $password){
    token
    user {
      id
      username
      email
      createdAt
    }
  }
}
*/
```

## Usage example

Say you have a graphql schema like this:

```gql
type Mutation {
  signup(email: String!, username: String!, password: String!): UserToken!
}

type UserToken {
  token: String!
  user: User!
}

type User {
  id: Int!
  username: String!
  email: String!
  createdAt: String!
}
```

Before this tool, you write graphql api test like this:

```js
const { GraphQLClient } = require('graphql-request');
require('should');

const host = 'http://localhost:8080/graphql';

test('signup', async () => {
  const gql = new GraphQLClient(host);
  const query = `mutation signup($username: String!, email: String!, password: String!){
    signup(username: $username, email: $email, password: $password){
      token
      user {
        id
        username
        email
        createdAt
      }
    }
  }`;

  const data = await gql.request(query, {
    username: 'tim',
    email: 'timqian92@qq.com',
    password: 'samplepass',
  });

  (typeof data.signup.token).should.equal('string');
);
```

As `gqlg` generated the queries for you, you don't need to write the query yourself, so your test will becomes:

```js
const { GraphQLClient } = require('graphql-request');
require('should');
const mutations = require('./example/output/mutations');

const host = 'http://localhost:8080/graphql';

test('signup', async () => {
  const gql = new GraphQLClient(host);

  const data = await gql.request(mutations.signup, {
    username: 'tim',
    email: 'timqian92@qq.com',
    password: 'samplepass',
  });

  (typeof data.signup.token).should.equal('string');
);
```

## Notice

As this tool is used for test, it expends all the fields in a query. And as we know, there might be recursive field in the query. So `gqlg` ignores the types which has been added in the parent queries already.

> [Donate with bitcoin](https://getcryptoo.github.io/)
