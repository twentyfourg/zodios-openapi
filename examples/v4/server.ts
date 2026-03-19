import { makeApi, makeErrors } from "@zodios/core/v4";
import { zodiosApp, zodiosRouter } from "@zodios/express/v4";
import { serve, setup } from "swagger-ui-express";
import { z } from "zod/v4";
import { bearerAuthScheme, openApiBuilder } from "../../src/index.v4";

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

const commentSchema = z.object({
  id: z.string(),
  content: z.string(),
  createdAt: z.string(),
  modifiedAt: z.string(),
});

type User = z.infer<typeof userSchema>;

const errors = makeErrors([
  {
    status: 404,
    description: "No users found",
    schema: z.object({
      message: z.enum(["No users found", "User not found"]),
    }),
  },
  {
    status: "default",
    description: "Default error",
    schema: z.object({
      message: z.string(),
    }),
  },
]);

const api = makeApi([
  {
    method: "get",
    path: "/users",
    alias: "getUsers",
    description: "Get all users",
    parameters: [
      {
        name: "limit",
        type: "Query",
        description: "Limit the number of users",
        schema: z.number().positive().default(10),
      },
      {
        name: "offset",
        type: "Query",
        description: "Offset the number of users",
        schema: z.number().positive().optional(),
      },
    ],
    response: z.array(userSchema),
    errors,
  },
  {
    method: "get",
    path: "/users/:id",
    alias: "getUser",
    description: "Get a user by id",
    response: userSchema,
    errors,
  },
  {
    method: "get",
    path: "/users/:id/comments",
    alias: "getComments",
    description: "Get all user comments",
    response: z.array(commentSchema),
    errors,
  },
]);

const adminApi = makeApi([
  {
    method: "post",
    path: "/users",
    alias: "createUser",
    description: "Create a user",
    parameters: [
      {
        name: "user",
        type: "Body",
        description: "The user to create",
        schema: userSchema.omit({ id: true }),
      },
    ],
    response: userSchema,
    errors,
  },
]);

const app = zodiosApp();
const userRouter = zodiosRouter([...api, ...adminApi]);

const users: User[] = [
  {
    id: "1",
    name: "John Doe",
    email: "john.doe@test.com",
  },
];

userRouter.get("/users", (_req, res) => {
  res.json(users);
});

app.use("/api/v1", userRouter);

const document = openApiBuilder({
  title: "User API",
  version: "1.0.0",
  description: "A simple user API",
})
  .addServer({ url: "/api/v1" })
  .addSecurityScheme("admin", bearerAuthScheme())
  .addPublicApi(api)
  .addProtectedApi("admin", adminApi)
  .build();

app.use(`/docs/swagger.json`, (_, res) => res.json(document));
app.use("/docs", serve);
app.use("/docs", setup(undefined, { swaggerUrl: "/docs/swagger.json" }));

app.listen(3000);
