import type { OpenAPIV3 } from "openapi-types";
import type {
  ZodiosEndpointDefinition,
  ZodiosEndpointDefinitions,
} from "@zodios/core/v4";
import * as z from "zod/v4";
import { isZodType } from "./utils.v4";

const pathRegExp = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
const expludedParamTypes = ["Body", "Path"];

function pathWithoutParams(path: string) {
  return path.indexOf("?") > -1
    ? path.split("?")[0]
    : path.indexOf("#") > -1
    ? path.split("#")[0]
    : path;
}

function tagsFromPath(path: string): string[] | undefined {
  const resources = pathWithoutParams(path)
    .replace(pathRegExp, "")
    .split("/")
    .filter((part) => part !== "");
  return resources ? [resources[resources.length - 1]] : undefined;
}

function normalizeSchemaObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeSchemaObject);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const normalized = value as Record<string, unknown>;
  delete normalized.$schema;
  if ("const" in normalized && normalized.enum === undefined) {
    normalized.enum = [normalized.const];
    delete normalized.const;
  }
  for (const key of Object.keys(normalized)) {
    normalized[key] = normalizeSchemaObject(normalized[key]);
  }
  return normalized;
}

function makeJsonSchema(schema: z.ZodType) {
  return normalizeSchemaObject(
    z.toJSONSchema(schema, {
      unrepresentable: "any",
    })
  ) as OpenAPIV3.SchemaObject;
}

export function bearerAuthScheme(
  description?: string
): OpenAPIV3.SecuritySchemeObject {
  return {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
    description,
  };
}

export function basicAuthScheme(
  description?: string
): OpenAPIV3.SecuritySchemeObject {
  return {
    type: "http",
    scheme: "basic",
    description,
  };
}

export function apiKeyAuthScheme(
  options: Omit<OpenAPIV3.ApiKeySecurityScheme, "type" | "description">,
  description?: string
): OpenAPIV3.SecuritySchemeObject {
  return {
    type: "apiKey",
    description,
    ...options,
  };
}

export function oauth2Scheme(
  flows: OpenAPIV3.OAuth2SecurityScheme["flows"],
  description?: string
): OpenAPIV3.SecuritySchemeObject {
  return {
    type: "oauth2",
    description,
    flows,
  };
}

function findPathParam(endpoint: ZodiosEndpointDefinition, paramName: string) {
  return endpoint.parameters?.find(
    (param) => param.type === "Path" && param.name === paramName
  );
}

function makeOpenApi(options: {
  apis: Array<
    | {
        definitions: ZodiosEndpointDefinitions;
      }
    | {
        scheme: string;
        securityRequirement?: string[];
        definitions: ZodiosEndpointDefinitions;
      }
  >;
  info?: OpenAPIV3.InfoObject;
  servers?: OpenAPIV3.ServerObject[];
  securitySchemes?: Record<string, OpenAPIV3.SecuritySchemeObject>;
  tagsFromPathFn?: (path: string) => string[];
}) {
  const { tagsFromPathFn = tagsFromPath } = options;
  const openApi: OpenAPIV3.Document = {
    openapi: "3.0.0",
    info: options.info ?? {
      title: "Zodios : add an info object to 'toOpenApi' options",
      version: "1.0.0",
    },
    servers: options.servers,
    paths: {},
  };
  if (options.securitySchemes) {
    openApi.components = {
      securitySchemes: options.securitySchemes,
    };
  }
  for (let api of options.apis) {
    for (let endpoint of api.definitions) {
      const responses: OpenAPIV3.ResponsesObject = {
        [`${endpoint.status ?? 200}`]: {
          description:
            endpoint.responseDescription ??
            endpoint.response.description ??
            "Success",
          content: {
            "application/json": {
              schema: makeJsonSchema(endpoint.response),
            },
          },
        },
      };
      for (let error of endpoint.errors ?? []) {
        responses[`${error.status}`] = {
          description: error.description ?? error.schema.description ?? "Error",
          content: {
            "application/json": {
              schema: makeJsonSchema(error.schema),
            },
          },
        };
      }
      const parameters: OpenAPIV3.ParameterObject[] = [];
      const pathParams = endpoint.path.match(pathRegExp);
      if (pathParams) {
        for (let pathParam of pathParams) {
          const paramName = pathParam.slice(1);
          const param = findPathParam(endpoint, paramName);
          if (param) {
            parameters.push({
              name: paramName,
              description: param.description ?? param.schema.description,
              in: "path",
              schema: makeJsonSchema(param.schema),
              required: true,
            });
          } else {
            parameters.push({
              name: paramName,
              in: "path",
              schema: {
                type: "string",
              },
              required: true,
            });
          }
        }
      }
      for (let param of endpoint.parameters ?? []) {
        if (!expludedParamTypes.includes(param.type)) {
          const required = !param.schema.isOptional();
          const schemaDesc = param.schema.description;
          const schema =
            required || !isZodType(param.schema, "optional")
              ? param.schema
              : (param.schema as z.ZodOptional<z.ZodType>).unwrap();

          parameters.push({
            name:
              param.type === "Query" && isZodType(param.schema, "array")
                ? `${param.name}[]`
                : param.name,
            in: param.type.toLowerCase(),
            schema: makeJsonSchema(schema),
            description: param.description ?? schemaDesc,
            required,
          } as OpenAPIV3.ParameterObject);
        }
      }
      const path = endpoint.path.replace(pathRegExp, "{$1}");
      const body = endpoint.parameters?.find((param) => param.type === "Body");

      const operation: OpenAPIV3.OperationObject = {
        operationId: endpoint.alias,
        summary: endpoint.description,
        description: endpoint.description,
        tags: tagsFromPathFn(endpoint.path),
        security:
          "scheme" in api && api.scheme
            ? [{ [api.scheme]: api.securityRequirement ?? ([] as string[]) }]
            : undefined,
        requestBody: body
          ? {
              description: body.description ?? body.schema.description,
              content: {
                "application/json": {
                  schema: makeJsonSchema(body.schema),
                },
              },
            }
          : undefined,
        parameters,
        responses,
      };
      openApi.paths[path] = {
        ...openApi.paths[path],
        [endpoint.method]: operation,
      };
    }
  }
  return openApi;
}

export function toOpenApi(
  definitions: ZodiosEndpointDefinitions,
  options?: {
    info?: OpenAPIV3.InfoObject;
    servers?: OpenAPIV3.ServerObject[];
    securityScheme?: OpenAPIV3.SecuritySchemeObject;
    tagsFromPathFn?: (path: string) => string[];
  }
): OpenAPIV3.Document {
  return makeOpenApi({
    apis: [
      {
        scheme: "auth",
        definitions,
      },
    ],
    securitySchemes: options?.securityScheme
      ? { auth: options.securityScheme }
      : undefined,
    ...options,
  });
}

export class OpenApiBuilder {
  apis: Array<
    | {
        definitions: ZodiosEndpointDefinitions;
      }
    | {
        scheme: string;
        securityRequirement?: string[];
        definitions: ZodiosEndpointDefinitions;
      }
  > = [];
  options: {
    info: OpenAPIV3.InfoObject;
    servers?: OpenAPIV3.ServerObject[];
    securitySchemes?: Record<string, OpenAPIV3.SecuritySchemeObject>;
    tagsFromPathFn?: (path: string) => string[];
  };
  constructor(info: OpenAPIV3.InfoObject) {
    this.options = { info };
  }

  addSecurityScheme(
    name: string,
    securityScheme: OpenAPIV3.SecuritySchemeObject
  ) {
    this.options.securitySchemes ??= {};
    this.options.securitySchemes[name] = securityScheme;
    return this;
  }

  addPublicApi(definitions: ZodiosEndpointDefinitions) {
    this.apis.push({ definitions });
    return this;
  }

  addProtectedApi(
    scheme: string,
    definitions: ZodiosEndpointDefinitions,
    securityRequirement?: string[]
  ) {
    this.apis.push({ scheme, definitions, securityRequirement });
    return this;
  }

  addServer(server: OpenAPIV3.ServerObject) {
    this.options.servers ??= [];
    this.options.servers.push(server);
    return this;
  }

  setCustomTagsFn(tagsFromPathFn: (path: string) => string[]) {
    this.options.tagsFromPathFn = tagsFromPathFn;
    return this;
  }

  build() {
    return makeOpenApi({
      apis: this.apis,
      ...this.options,
    });
  }
}

export function openApiBuilder(info: OpenAPIV3.InfoObject) {
  return new OpenApiBuilder(info);
}
