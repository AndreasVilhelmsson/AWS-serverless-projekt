import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import crypto from "crypto";

// --- DynamoDB client ---
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME;
const baseHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "OPTIONS,GET,POST",
};

export const handler = async (event) => {
  try {
    const { method, path } = event.requestContext?.http ?? {};

    // Preflight: när CORS sköts i API Gateway behövs inte headers här.
    if (method === "OPTIONS") {
      return { statusCode: 204, headers: baseHeaders, body: "" };
    }

    if (method === "GET" && path === "/health") {
      return {
        statusCode: 200,
        headers: baseHeaders,
        body: JSON.stringify({ ok: true, ts: Date.now() }),
      };
    }

    if (method === "GET" && path === "/messages") {
      const res = await ddb.send(new ScanCommand({ TableName: TABLE }));
      const items = (res.Items ?? []).sort(
        (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)
      );
      return {
        statusCode: 200,
        headers: baseHeaders,
        body: JSON.stringify(items),
      };
    }

    if (method === "POST" && path === "/messages") {
      // Validera JSON
      let body = {};
      try {
        body = JSON.parse(event.body || "{}");
      } catch {
        return {
          statusCode: 400,
          headers: baseHeaders,
          body: JSON.stringify({ error: "Invalid JSON body" }),
        };
      }

      const name = String(body.name ?? "").trim();
      const message = String(body.message ?? "").trim();
      if (!name || !message) {
        return {
          statusCode: 422,
          headers: baseHeaders,
          body: JSON.stringify({ error: "name and message are required" }),
        };
      }

      const item = {
        id: crypto.randomUUID(),
        name,
        message,
        createdAt: Date.now(),
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));

      return {
        statusCode: 201,
        headers: baseHeaders,
        body: JSON.stringify(item),
      };
    }

    // Okänd route/metod
    return {
      statusCode: 404,
      headers: baseHeaders,
      body: JSON.stringify({ error: "not found" }),
    };
  } catch (err) {
    console.error("[lambda error]", err);
    return {
      statusCode: 500,
      headers: baseHeaders,
      body: JSON.stringify({ error: "internal" }),
    };
  }
};
