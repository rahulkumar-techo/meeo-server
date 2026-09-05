import { buildSchema } from "graphql";

export const graphqlSchema = buildSchema(`
    type Health {
        status: String!
        service: String!
        timestamp: String!
    }

    type Query {
        health: Health!
    }
`);

const healthField = graphqlSchema.getQueryType()?.getFields().health;
if (!healthField) {
    throw new Error("GraphQL health field is not configured");
}

healthField.resolve = () => ({
        status: "ok",
        service: "e-com-server",
        timestamp: new Date().toISOString(),
});