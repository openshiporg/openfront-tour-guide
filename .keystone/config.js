"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name3 in all)
    __defProp(target, name3, { get: all[name3], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// features/keystone/utils/paymentState.ts
function stripeRefundReference(id) {
  if (id.startsWith("pi_")) return { payment_intent: id };
  if (id.startsWith("ch_")) return { charge: id };
  throw new Error("Stripe refund requires a payment intent or charge reference");
}
var init_paymentState = __esm({
  "features/keystone/utils/paymentState.ts"() {
    "use strict";
  }
});

// features/integrations/payment/stripe.ts
var stripe_exports = {};
__export(stripe_exports, {
  cancelPaymentFunction: () => cancelPaymentFunction,
  capturePaymentFunction: () => capturePaymentFunction,
  createPaymentFunction: () => createPaymentFunction,
  generatePaymentLinkFunction: () => generatePaymentLinkFunction,
  getPaymentStatusFunction: () => getPaymentStatusFunction,
  handleWebhookFunction: () => handleWebhookFunction,
  refundPaymentFunction: () => refundPaymentFunction
});
async function createPaymentFunction({ order, amount, currency: currency2, idempotencyKey }) {
  const stripe = getStripeClient();
  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount,
      currency: currency2.toLowerCase(),
      payment_method_types: ["card"],
      metadata: {
        orderId: order?.id || "",
        orderNumber: order?.orderNumber || ""
      }
    },
    idempotencyKey ? { idempotencyKey } : void 0
  );
  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id
  };
}
async function capturePaymentFunction({ paymentId, amount, idempotencyKey }) {
  const stripe = getStripeClient();
  const paymentIntent = await stripe.paymentIntents.capture(paymentId, {
    ...amount == null ? {} : { amount_to_capture: amount }
  }, idempotencyKey ? { idempotencyKey } : void 0);
  return {
    status: paymentIntent.status,
    amount: paymentIntent.amount_received,
    currencyCode: paymentIntent.currency.toUpperCase(),
    data: paymentIntent
  };
}
async function refundPaymentFunction({ paymentId, amount, idempotencyKey, refundId }) {
  const stripe = getStripeClient();
  const refund = refundId ? await stripe.refunds.retrieve(refundId) : await stripe.refunds.create(
    { ...stripeRefundReference(paymentId), amount, ...idempotencyKey ? { metadata: { tourRefundKey: idempotencyKey } } : {} },
    idempotencyKey ? { idempotencyKey } : void 0
  );
  return {
    id: refund.id,
    refundId: refund.id,
    status: refund.status,
    amount: refund.amount,
    data: refund
  };
}
async function getPaymentStatusFunction({ paymentId }) {
  const stripe = getStripeClient();
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);
  const refunds = [];
  let refundsComplete = true;
  for await (const refund of stripe.refunds.list({ payment_intent: paymentId, limit: 100 })) {
    if (refunds.length >= 1e3) {
      refundsComplete = false;
      break;
    }
    refunds.push(refund);
  }
  return {
    status: paymentIntent.status,
    amount: paymentIntent.status === "succeeded" ? paymentIntent.amount_received : paymentIntent.amount,
    currencyCode: paymentIntent.currency.toUpperCase(),
    refunds,
    refundsComplete,
    data: paymentIntent
  };
}
async function generatePaymentLinkFunction({ paymentId }) {
  return `https://dashboard.stripe.com/payments/${paymentId}`;
}
async function handleWebhookFunction({ event, headers, rawBody }) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("Stripe webhook secret is not configured");
  }
  const stripe = getStripeClient();
  try {
    if (!rawBody) throw new Error("Stripe webhook raw body is required");
    const stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      headers["stripe-signature"],
      webhookSecret
    );
    return {
      isValid: true,
      event: stripeEvent,
      type: stripeEvent.type,
      resource: stripeEvent.data.object
    };
  } catch (err) {
    throw new Error(`Webhook signature verification failed: ${err?.message || "Unknown error"}`);
  }
}
async function cancelPaymentFunction({ paymentId, idempotencyKey }) {
  const stripe = getStripeClient();
  const current = await stripe.paymentIntents.retrieve(paymentId);
  if (current.status === "canceled") return { status: "cancelled" };
  if (current.status === "succeeded") return { status: "succeeded" };
  const cancelled = await stripe.paymentIntents.cancel(paymentId, {}, idempotencyKey ? { idempotencyKey } : void 0);
  return { status: cancelled.status === "canceled" ? "cancelled" : cancelled.status };
}
var import_stripe, getStripeClient;
var init_stripe = __esm({
  "features/integrations/payment/stripe.ts"() {
    "use strict";
    import_stripe = __toESM(require("stripe"));
    init_paymentState();
    getStripeClient = () => {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        throw new Error("Stripe secret key not configured");
      }
      return new import_stripe.default(stripeKey);
    };
  }
});

// features/integrations/payment/manual.ts
var manual_exports = {};
__export(manual_exports, {
  cancelPaymentFunction: () => cancelPaymentFunction2,
  capturePaymentFunction: () => capturePaymentFunction2,
  createPaymentFunction: () => createPaymentFunction2,
  generatePaymentLinkFunction: () => generatePaymentLinkFunction2,
  getPaymentStatusFunction: () => getPaymentStatusFunction2,
  handleWebhookFunction: () => handleWebhookFunction2,
  refundPaymentFunction: () => refundPaymentFunction2
});
async function handleWebhookFunction2({ event, headers }) {
  return {
    isValid: true,
    event,
    type: event.type,
    resource: event.data
  };
}
async function createPaymentFunction2({ order, amount, currency: currency2 }) {
  return {
    status: "pending",
    data: {
      status: "pending",
      amount,
      currency: currency2.toLowerCase(),
      orderId: order?.id
    }
  };
}
async function capturePaymentFunction2({ paymentId, amount }) {
  return {
    status: "captured",
    amount,
    data: {
      status: "captured",
      amount,
      captured_at: (/* @__PURE__ */ new Date()).toISOString()
    }
  };
}
async function refundPaymentFunction2({ paymentId, amount }) {
  return {
    status: "refunded",
    amount,
    data: {
      status: "refunded",
      amount,
      refunded_at: (/* @__PURE__ */ new Date()).toISOString()
    }
  };
}
async function getPaymentStatusFunction2({ paymentId }) {
  return {
    status: "succeeded",
    data: {
      status: "succeeded"
    }
  };
}
async function generatePaymentLinkFunction2({ paymentId }) {
  return null;
}
async function cancelPaymentFunction2() {
  return { status: "cancelled" };
}
var init_manual = __esm({
  "features/integrations/payment/manual.ts"() {
    "use strict";
  }
});

// keystone.ts
var keystone_exports = {};
__export(keystone_exports, {
  default: () => keystone_default2
});
module.exports = __toCommonJS(keystone_exports);

// features/keystone/index.ts
var import_auth = require("@keystone-6/auth");
var import_core18 = require("@keystone-6/core");
var import_config = require("dotenv/config");

// features/keystone/models/User.ts
var import_core = require("@keystone-6/core");
var import_access = require("@keystone-6/core/access");
var import_fields2 = require("@keystone-6/core/fields");

// features/keystone/models/trackingFields.ts
var import_fields = require("@keystone-6/core/fields");
var trackingFields = {
  createdAt: (0, import_fields.timestamp)({
    access: { read: () => true, create: () => false, update: () => false },
    validation: { isRequired: true },
    defaultValue: { kind: "now" },
    ui: {
      createView: { fieldMode: "hidden" },
      itemView: { fieldMode: "read" }
    }
  }),
  updatedAt: (0, import_fields.timestamp)({
    access: { read: () => true, create: () => false, update: () => false },
    db: { updatedAt: true },
    validation: { isRequired: true },
    defaultValue: { kind: "now" },
    ui: {
      createView: { fieldMode: "hidden" },
      itemView: { fieldMode: "read" }
    }
  })
};

// features/keystone/access.ts
var permissionNames = [
  "canSeeOtherPeople",
  "canEditOtherPeople",
  "canManagePeople",
  "canManageRoles",
  "canAccessDashboard",
  "canManageOnboarding",
  "canManagePayments",
  "canReadPayments",
  "canIssueRefunds",
  "canReadAudit",
  "canManageTours",
  "canManageDepartures",
  "canManageBookings",
  "canManageGuides",
  "canManageResources",
  "canManageChannels",
  "canCheckIn",
  "canReadMedicalNotes",
  "canManagePromos",
  "canManageWaivers",
  "canManageSettings",
  "canManageCustomers"
];
var isSignedIn = ({ session }) => Boolean(session?.itemId);
var permissions = Object.fromEntries(permissionNames.map((key) => [key, ({ session }) => session?.data.role?.[key] === true]));
var rules = {
  // Customers are Users with bookings: canManageCustomers reads them too (editing stays with canEditOtherPeople).
  canReadPeople: ({ session }) => !session ? false : session.data.role?.canSeeOtherPeople || session.data.role?.canManageCustomers ? true : { id: { equals: session.itemId } },
  canUpdatePeople: ({ session }) => !session ? false : session.data.role?.canEditOtherPeople ? true : { id: { equals: session.itemId } }
};

// features/keystone/models/User.ts
var User = (0, import_core.list)({
  access: {
    operation: {
      ...(0, import_access.allOperations)(isSignedIn),
      create: (args) => {
        if (process.env.PUBLIC_SIGNUPS_ALLOWED === "true") {
          return true;
        }
        return permissions.canManagePeople(args);
      },
      delete: permissions.canManagePeople
    },
    filter: {
      query: rules.canReadPeople,
      update: rules.canUpdatePeople
    }
  },
  ui: {
    hideCreate: (args) => !permissions.canManagePeople(args),
    hideDelete: (args) => !permissions.canManagePeople(args),
    listView: {
      initialColumns: ["name", "email", "role"]
    },
    itemView: {
      defaultFieldMode: ({ session, item }) => {
        if (session?.data.role?.canEditOtherPeople) return "edit";
        if (session?.itemId === item?.id) return "edit";
        return "read";
      }
    }
  },
  fields: {
    name: (0, import_fields2.text)({
      validation: {
        isRequired: true
      }
    }),
    email: (0, import_fields2.text)({
      isFilterable: false,
      isOrderable: false,
      isIndexed: "unique",
      validation: {
        isRequired: true
      }
    }),
    password: (0, import_fields2.password)({
      access: {
        read: import_access.denyAll,
        update: ({ session, item }) => permissions.canManagePeople({ session }) || session?.itemId === item.id
      },
      validation: { isRequired: true }
    }),
    role: (0, import_fields2.relationship)({
      ref: "Role.assignedTo",
      access: {
        create: permissions.canManagePeople,
        update: permissions.canManagePeople
      },
      ui: {
        itemView: {
          fieldMode: (args) => permissions.canManagePeople(args) ? "edit" : "read"
        }
      }
    }),
    onboardingStatus: (0, import_fields2.select)({ options: ["not_started", "in_progress", "completed", "dismissed"], defaultValue: "not_started" }),
    bookings: (0, import_fields2.relationship)({ ref: "Booking.customer", many: true }),
    guide: (0, import_fields2.relationship)({ ref: "Guide.user" }),
    auditEvents: (0, import_fields2.relationship)({ ref: "AuditEvent.actor", many: true }),
    ...trackingFields
  }
});

// features/keystone/models/Role.ts
var import_core2 = require("@keystone-6/core");
var import_access3 = require("@keystone-6/core/access");
var import_fields3 = require("@keystone-6/core/fields");
var Role = (0, import_core2.list)({
  access: {
    operation: {
      ...(0, import_access3.allOperations)(permissions.canManageRoles),
      query: isSignedIn
    }
  },
  ui: {
    hideCreate: (args) => !permissions.canManageRoles(args),
    hideDelete: (args) => !permissions.canManageRoles(args),
    listView: {
      initialColumns: ["name", "assignedTo"]
    },
    itemView: {
      defaultFieldMode: (args) => permissions.canManageRoles(args) ? "edit" : "read"
    }
  },
  fields: {
    name: (0, import_fields3.text)({ validation: { isRequired: true } }),
    ...Object.fromEntries(permissionNames.map((key) => [key, (0, import_fields3.checkbox)({ defaultValue: false })])),
    ...trackingFields,
    assignedTo: (0, import_fields3.relationship)({
      ref: "User.role",
      many: true,
      ui: {
        itemView: { fieldMode: "read" }
      }
    })
  }
});

// features/keystone/models/OAuthApp.ts
var import_core3 = require("@keystone-6/core");
var import_fields4 = require("@keystone-6/core/fields");

// features/keystone/mcp-oauth/core.ts
var import_node_crypto = __toESM(require("node:crypto"));
var MCP_SCOPES = ["mcp:read", "mcp:write"];
var MCP_ACCESS_PREFIX = "mcp_at_";
var ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
var REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
var AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1e3;
var CONSENT_TICKET_TTL_MS = 10 * 60 * 1e3;
var DEVELOPMENT_SECRET = "this secret should only be used in testing";
function secret() {
  return process.env.SESSION_SECRET || DEVELOPMENT_SECRET;
}
function randomToken(prefix, bytes = 32) {
  return `${prefix}${import_node_crypto.default.randomBytes(bytes).toString("base64url")}`;
}
function digestToken(token, purpose = "mcp-oauth-token") {
  return import_node_crypto.default.createHmac("sha256", secret()).update(`${purpose}\0${token}`, "utf8").digest("hex");
}
function bearerToken(header) {
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== "string") return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(value);
  return match ? match[1] : null;
}
function isMcpAccessToken(token) {
  return typeof token === "string" && token.startsWith(MCP_ACCESS_PREFIX) && token.length > MCP_ACCESS_PREFIX.length;
}
function storedScopes(value) {
  return Array.isArray(value) ? MCP_SCOPES.filter((scope) => value.includes(scope)) : [];
}

// features/keystone/models/OAuthApp.ts
var OAuthApp = (0, import_core3.list)({
  access: {
    operation: {
      query: permissions.canManagePeople,
      create: permissions.canManagePeople,
      update: permissions.canManagePeople,
      delete: permissions.canManagePeople
    }
  },
  fields: {
    name: (0, import_fields4.text)({
      validation: {
        isRequired: true
      }
    }),
    clientId: (0, import_fields4.text)({
      isIndexed: "unique",
      hooks: {
        resolveInput: ({ operation, resolvedData }) => {
          if (operation === "create" && !resolvedData.clientId) {
            return randomToken("mcp_cl_", 18);
          }
          return resolvedData.clientId;
        }
      },
      ui: {
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "read" },
        description: "Auto-generated unique identifier for your application."
      }
    }),
    clientSecret: (0, import_fields4.text)({
      access: {
        read: () => false
      },
      hooks: {
        resolveInput: ({ resolvedData }) => {
          if (resolvedData.clientSecret) {
            return digestToken(resolvedData.clientSecret, "oauth-client-secret");
          }
          return void 0;
        }
      },
      ui: {
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "hidden" },
        description: "Stored only as a digest. Public MCP clients have no secret."
      }
    }),
    tokenEndpointAuthMethod: (0, import_fields4.select)({
      options: [
        { label: "Client secret (POST)", value: "client_secret_post" },
        { label: "Client secret (Basic)", value: "client_secret_basic" },
        { label: "None (public PKCE client)", value: "none" }
      ],
      defaultValue: "client_secret_post",
      ui: {
        description: "How the app authenticates at the token endpoint. MCP clients are public (none)."
      }
    }),
    redirectUris: (0, import_fields4.json)({
      defaultValue: [],
      ui: {
        description: "Array of allowed redirect URIs for OAuth callbacks"
      }
    }),
    scopes: (0, import_fields4.json)({
      defaultValue: [...MCP_SCOPES],
      ui: {
        description: "Array of allowed OAuth scopes. MCP scopes only narrow the signed-in user's own access."
      }
    }),
    webhookUrl: (0, import_fields4.text)({
      ui: {
        description: "URL to receive webhook notifications"
      }
    }),
    status: (0, import_fields4.select)({
      options: [
        { label: "Active", value: "active" },
        { label: "Suspended", value: "suspended" },
        { label: "Pending", value: "pending" }
      ],
      defaultValue: "active"
    }),
    installUrl: (0, import_fields4.text)({
      ui: {
        description: "URL where users can install this app"
      }
    }),
    uninstallUrl: (0, import_fields4.text)({
      ui: {
        description: "URL to handle app uninstallation"
      }
    }),
    description: (0, import_fields4.text)({
      ui: {
        displayMode: "textarea"
      }
    }),
    metadata: (0, import_fields4.json)({
      defaultValue: {},
      ui: {
        description: "Additional app-specific configuration and settings"
      }
    }),
    developerEmail: (0, import_fields4.text)(),
    privacyPolicyUrl: (0, import_fields4.text)(),
    termsOfServiceUrl: (0, import_fields4.text)(),
    supportUrl: (0, import_fields4.text)(),
    ...trackingFields
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "clientId", "status", "createdAt"]
    }
  }
});

// features/keystone/models/OAuthToken.ts
var import_core5 = require("@keystone-6/core");
var import_fields5 = require("@keystone-6/core/fields");
var digestTokenInput = {
  resolveInput: ({ resolvedData, fieldKey }) => resolvedData[fieldKey] ? digestToken(resolvedData[fieldKey]) : resolvedData[fieldKey]
};
var OAuthToken = (0, import_core5.list)({
  access: {
    operation: {
      query: permissions.canManagePeople,
      create: permissions.canManagePeople,
      update: permissions.canManagePeople,
      delete: permissions.canManagePeople
    }
  },
  fields: {
    tokenType: (0, import_fields5.select)({
      options: [
        { label: "Authorization Code", value: "authorization_code" },
        { label: "Access Token", value: "access_token" },
        { label: "Refresh Token", value: "refresh_token" }
      ],
      validation: {
        isRequired: true
      }
    }),
    token: (0, import_fields5.text)({
      access: { read: () => false },
      validation: {
        isRequired: true
      },
      isIndexed: "unique",
      hooks: digestTokenInput
    }),
    clientId: (0, import_fields5.text)({
      validation: {
        isRequired: true
      },
      isIndexed: true
    }),
    user: (0, import_fields5.relationship)({
      ref: "User",
      ui: {
        description: "The user who authorized this token"
      }
    }),
    scopes: (0, import_fields5.json)({
      defaultValue: [],
      ui: {
        description: "Array of granted scopes"
      }
    }),
    redirectUri: (0, import_fields5.text)({
      ui: {
        description: "The redirect URI used during authorization"
      }
    }),
    resource: (0, import_fields5.text)({
      ui: {
        description: "The MCP endpoint (RFC 8707 resource) this grant is for"
      }
    }),
    expiresAt: (0, import_fields5.timestamp)({
      ui: {
        description: "When this token expires"
      }
    }),
    isRevoked: (0, import_fields5.select)({
      options: [
        { label: "Active", value: "false" },
        { label: "Revoked", value: "true" }
      ],
      defaultValue: "false"
    }),
    authorizationCode: (0, import_fields5.text)({
      access: { read: () => false },
      hooks: digestTokenInput,
      ui: {
        description: "The authorization code that was exchanged for this token (for access tokens)"
      }
    }),
    refreshToken: (0, import_fields5.text)({
      access: { read: () => false },
      hooks: digestTokenInput,
      ui: {
        description: "Associated refresh token (for access tokens)"
      }
    }),
    accessToken: (0, import_fields5.text)({
      access: { read: () => false },
      hooks: digestTokenInput,
      ui: {
        description: "Associated access token (for refresh tokens)"
      }
    }),
    state: (0, import_fields5.text)({
      ui: {
        description: "OAuth state parameter for CSRF protection"
      }
    }),
    codeChallenge: (0, import_fields5.text)({
      ui: {
        description: "PKCE code challenge"
      }
    }),
    codeChallengeMethod: (0, import_fields5.select)({
      options: [
        { label: "Plain", value: "plain" },
        { label: "SHA256", value: "S256" }
      ],
      ui: {
        description: "PKCE code challenge method"
      }
    }),
    ...trackingFields
  },
  ui: {
    labelField: "clientId",
    listView: {
      initialColumns: ["tokenType", "clientId", "user", "scopes", "expiresAt", "isRevoked"]
    }
  }
});

// features/keystone/models/Tour.ts
var import_fields7 = require("@keystone-6/core/fields");

// features/keystone/models/domainFields.ts
var import_core7 = require("@keystone-6/core");
var import_fields6 = require("@keystone-6/core/fields");
var name = () => (0, import_fields6.text)({ validation: { isRequired: true } });
var money = () => (0, import_fields6.integer)({ defaultValue: 0, validation: { min: 0 } });
var currency = () => (0, import_fields6.text)({ defaultValue: "USD", validation: { match: { regex: /^[A-Z]{3}$/, explanation: "ISO 4217 currency" } } });
var state = (values, initial = values[0]) => (0, import_fields6.select)({ type: "enum", options: values.map((value) => ({ label: value.replaceAll("_", " "), value })), defaultValue: initial, access: { update: () => false } });
var rel = (ref, many = false) => (0, import_fields6.relationship)({ ref, many });
var domainList = (capability, fields, commandOnly = false, hooks) => (0, import_core7.list)({
  access: { operation: { query: permissions[capability], create: commandOnly ? () => false : permissions[capability], update: commandOnly ? () => false : permissions[capability], delete: () => false } },
  fields: { ...fields, ...trackingFields },
  ...hooks ? { hooks } : {}
});

// features/keystone/models/Tour.ts
var Tour = domainList("canManageTours", {
  name: name(),
  slug: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true } }),
  kind: state(["walking", "food", "water", "bike", "vehicle_day_trip", "multi_day", "private_only"]),
  description: (0, import_fields7.text)({ ui: { displayMode: "textarea" } }),
  highlights: (0, import_fields7.json)(),
  durationMinutes: (0, import_fields7.integer)({ defaultValue: 120, validation: { min: 1 } }),
  durationDays: (0, import_fields7.integer)({ validation: { min: 1 } }),
  timezone: (0, import_fields7.text)({ defaultValue: "America/New_York" }),
  meetingPoint: rel("MeetingPoint.tours"),
  minParticipants: (0, import_fields7.integer)({ defaultValue: 1, validation: { min: 1 } }),
  maxParticipants: (0, import_fields7.integer)({ defaultValue: 24, validation: { min: 1 } }),
  guideRatio: (0, import_fields7.integer)({ defaultValue: 12, validation: { min: 1 } }),
  requiresResourceKind: state(["none", "van", "kayak", "bike", "boat"]),
  minAge: (0, import_fields7.integer)({ defaultValue: 0, validation: { min: 0 } }),
  fitnessLevel: (0, import_fields7.text)(),
  inclusions: (0, import_fields7.json)(),
  exclusions: (0, import_fields7.json)(),
  whatToBring: (0, import_fields7.text)(),
  images: (0, import_fields7.json)(),
  cancellationPolicy: rel("CancellationPolicy.tours"),
  requiresWaiver: rel("WaiverTemplate.tours"),
  requiredCertifications: (0, import_fields7.json)({ defaultValue: [] }),
  status: state(["draft", "active", "archived"]),
  ticketTypes: rel("TicketType.tour", true),
  addOns: rel("AddOn.tour", true),
  pricingRules: rel("PricingRule.tour", true),
  schedules: rel("Schedule.tour", true),
  departures: rel("Departure.tour", true),
  promoCodes: rel("PromoCode.tours", true)
});

// features/keystone/models/catalog.ts
var import_fields8 = require("@keystone-6/core/fields");
var TicketType = domainList("canManageTours", { name: name(), tour: rel("Tour.ticketTypes"), priceCents: money(), currencyCode: currency(), countsTowardCapacity: (0, import_fields8.checkbox)({ defaultValue: true }), seatsUsed: (0, import_fields8.integer)({ defaultValue: 1, validation: { min: 0 } }), minAge: (0, import_fields8.integer)(), maxAge: (0, import_fields8.integer)(), active: (0, import_fields8.checkbox)({ defaultValue: true }), pricingRules: rel("PricingRule.ticketType", true) });
var AddOn = domainList("canManageTours", { name: name(), tour: rel("Tour.addOns"), priceCents: money(), currencyCode: currency(), perPerson: (0, import_fields8.checkbox)({ defaultValue: true }), inventory: (0, import_fields8.integer)({ validation: { min: 0 } }) });
var MeetingPoint = domainList("canManageTours", { name: name(), address: (0, import_fields8.text)(), latitude: (0, import_fields8.text)(), longitude: (0, import_fields8.text)(), instructions: (0, import_fields8.text)(), mapLink: (0, import_fields8.text)(), tours: rel("Tour.meetingPoint", true) });
var CancellationPolicy = domainList("canManageTours", { name: name(), rules: (0, import_fields8.json)({ defaultValue: [{ hoursBefore: 24, refundBps: 1e4 }, { hoursBefore: 0, refundBps: 0 }] }), weatherFullRefund: (0, import_fields8.checkbox)({ defaultValue: true }), tours: rel("Tour.cancellationPolicy", true) });
var PricingRule = domainList("canManageTours", { name: name(), tour: rel("Tour.pricingRules"), ticketType: rel("TicketType.pricingRules"), validFrom: (0, import_fields8.timestamp)(), validTo: (0, import_fields8.timestamp)(), weekdays: (0, import_fields8.json)(), adjustBps: (0, import_fields8.integer)(), overridePriceCents: (0, import_fields8.integer)({ validation: { min: 0 } }), currencyCode: currency() });
var Schedule = domainList("canManageDepartures", { name: name(), tour: rel("Tour.schedules"), rrule: (0, import_fields8.text)({ defaultValue: "FREQ=DAILY" }), startTimes: (0, import_fields8.json)({ defaultValue: ["09:00"] }), validFrom: (0, import_fields8.timestamp)(), validTo: (0, import_fields8.timestamp)(), capacityOverride: (0, import_fields8.integer)({ validation: { min: 1 } }), departures: rel("Departure.schedule", true) });

// features/keystone/models/Departure.ts
var import_core8 = require("@keystone-6/core");
var import_fields9 = require("@keystone-6/core/fields");
async function occupancy(item, context) {
  const [bookings, holds, assignments] = await Promise.all([
    context.prisma.booking.aggregate({ where: { departureId: item.id, status: { in: ["confirmed", "checked_in", "completed", "no_show"] } }, _sum: { seats: true } }),
    context.prisma.inventoryHold.aggregate({ where: { departureId: item.id, status: "active", expiresAt: { gt: /* @__PURE__ */ new Date() } }, _sum: { quantity: true } }),
    context.prisma.guideAssignment.count({ where: { departureId: item.id, status: { in: ["accepted", "worked"] } } })
  ]);
  const tour = await context.prisma.tour.findUnique({ where: { id: item.tourId } });
  return { booked: bookings._sum.seats || 0, held: holds._sum.quantity || 0, assigned: assignments, ratio: tour?.guideRatio || 12 };
}
var count = (key) => (0, import_fields9.virtual)({ field: import_core8.graphql.field({ type: import_core8.graphql.Int, async resolve(item, _args, context) {
  const o = await occupancy(item, context);
  return key === "remaining" ? Math.max(0, item.capacity - o.booked - o.held) : key === "guidesNeeded" ? Math.ceil(o.booked / o.ratio) : o[key];
} }) });
var Departure = domainList("canManageDepartures", {
  departureKey: (0, import_fields9.text)({ isIndexed: "unique", validation: { isRequired: true } }),
  tour: rel("Tour.departures"),
  schedule: rel("Schedule.departures"),
  startAt: (0, import_fields9.timestamp)({ validation: { isRequired: true }, isIndexed: true }),
  endAt: (0, import_fields9.timestamp)({ validation: { isRequired: true } }),
  capacity: (0, import_fields9.integer)({ validation: { isRequired: true, min: 1 } }),
  status: state(["scheduled", "on_sale", "min_not_met", "confirmed", "full", "closed", "in_progress", "completed", "cancelled", "weather_cancelled"]),
  bookingCutoffMinutes: (0, import_fields9.integer)({ defaultValue: 60, validation: { min: 0 } }),
  assignedGuides: rel("GuideAssignment.departure", true),
  resourceAssignments: rel("ResourceAssignment.departure", true),
  holds: rel("InventoryHold.departure", true),
  bookings: rel("Booking.departure", true),
  tasks: rel("OperationalTask.departure", true),
  waitlist: rel("WaitlistEntry.departure", true),
  notes: (0, import_fields9.text)(),
  booked: count("booked"),
  held: count("held"),
  remaining: count("remaining"),
  guidesNeeded: count("guidesNeeded"),
  staffed: (0, import_fields9.virtual)({ field: import_core8.graphql.field({ type: import_core8.graphql.Boolean, async resolve(item, _a, context) {
    const o = await occupancy(item, context);
    return o.assigned >= Math.ceil(o.booked / o.ratio);
  } }) })
}, true);

// features/keystone/models/staffing.ts
var import_fields10 = require("@keystone-6/core/fields");
var Guide = domainList("canManageGuides", { name: name(), user: rel("User.guide"), languages: (0, import_fields10.json)({ defaultValue: ["English"] }), certifications: rel("GuideCertification.guide", true), payRateType: state(["per_tour", "hourly"]), payRateCents: money(), currencyCode: currency(), status: state(["active", "inactive"]), photo: (0, import_fields10.text)(), bio: (0, import_fields10.text)(), availability: rel("GuideAvailability.guide", true), assignments: rel("GuideAssignment.guide", true), payouts: rel("GuidePayout.guide", true) });
var GuideCertification = domainList("canManageGuides", { name: name(), guide: rel("Guide.certifications"), expiresAt: (0, import_fields10.timestamp)(), reference: (0, import_fields10.text)() });
var GuideAvailability = domainList("canManageGuides", { guide: rel("Guide.availability"), startAt: (0, import_fields10.timestamp)(), endAt: (0, import_fields10.timestamp)(), weeklyRules: (0, import_fields10.json)(), unavailable: (0, import_fields10.json)({ defaultValue: [] }) });
var GuideAssignment = domainList("canManageGuides", { departure: rel("Departure.assignedGuides"), guide: rel("Guide.assignments"), role: state(["lead", "assistant", "driver"]), status: state(["offered", "accepted", "declined", "cancelled", "worked"]), payCents: money(), currencyCode: currency(), payout: rel("GuidePayout.assignments") }, true);
var Resource = domainList("canManageResources", { name: name(), kind: state(["van", "kayak", "bike", "boat"]), seats: (0, import_fields10.integer)({ defaultValue: 1, validation: { min: 1 } }), quantity: (0, import_fields10.integer)({ defaultValue: 1, validation: { min: 1 } }), status: state(["active", "maintenance"]), assignments: rel("ResourceAssignment.resource", true) });
var ResourceAssignment = domainList("canManageResources", { departure: rel("Departure.resourceAssignments"), resource: rel("Resource.assignments"), quantity: (0, import_fields10.integer)({ defaultValue: 1, validation: { min: 1 } }) }, true);
var GuidePayout = domainList("canManageGuides", { guide: rel("Guide.payouts"), periodStart: (0, import_fields10.timestamp)(), periodEnd: (0, import_fields10.timestamp)(), assignments: rel("GuideAssignment.payout", true), totalCents: money(), currencyCode: currency(), status: state(["draft", "approved", "paid"]), paidAt: (0, import_fields10.timestamp)(), reference: (0, import_fields10.text)() }, true);

// features/keystone/models/Booking.ts
var import_fields11 = require("@keystone-6/core/fields");
var InventoryHold = domainList("canManageBookings", { departure: rel("Departure.holds"), quantity: (0, import_fields11.integer)({ validation: { isRequired: true, min: 1 } }), expiresAt: (0, import_fields11.timestamp)({ validation: { isRequired: true }, isIndexed: true }), cartTokenHash: (0, import_fields11.text)({ access: { read: () => false }, isIndexed: true }), status: state(["active", "converted", "released", "expired"]), quote: (0, import_fields11.json)({ access: { read: () => false } }), booking: rel("Booking.hold") }, true);
var Booking = domainList("canManageBookings", {
  bookingRef: (0, import_fields11.text)({ isIndexed: "unique", validation: { isRequired: true } }),
  departure: rel("Departure.bookings"),
  customer: rel("User.bookings"),
  guestName: (0, import_fields11.text)(),
  guestEmail: (0, import_fields11.text)({ isIndexed: true }),
  guestPhone: (0, import_fields11.text)(),
  status: state(["pending_payment", "confirmed", "checked_in", "completed", "no_show", "cancelled", "refunded", "partially_refunded"]),
  channel: rel("Channel.bookings"),
  source: state(["online", "phone", "walk_up", "reseller"]),
  subtotalCents: money(),
  addOnsCents: money(),
  discountCents: money(),
  taxCents: money(),
  feeCents: money(),
  totalCents: money(),
  channelCommissionCents: money(),
  refundedCents: money(),
  currencyCode: currency(),
  seats: (0, import_fields11.integer)({ defaultValue: 0, validation: { min: 0 } }),
  policySnapshot: (0, import_fields11.json)(),
  tourSnapshot: (0, import_fields11.json)(),
  paymentCollection: rel("PaymentCollection.booking"),
  payments: rel("Payment.order", true),
  refunds: rel("Refund.order", true),
  secretKey: (0, import_fields11.text)({ access: { read: () => false } }),
  specialRequests: (0, import_fields11.text)(),
  pickupLocation: (0, import_fields11.text)(),
  promoRedemptions: rel("PromoRedemption.booking", true),
  participants: rel("Participant.booking", true),
  lines: rel("BookingLine.booking", true),
  hold: rel("InventoryHold.booking"),
  statement: rel("ChannelStatement.bookings"),
  rebookCreditHash: (0, import_fields11.text)({ access: { read: () => false }, isIndexed: "unique", db: { isNullable: true } }),
  creditUsedAt: (0, import_fields11.timestamp)(),
  manageTokenVersion: (0, import_fields11.integer)({ defaultValue: 0, validation: { min: 0 }, access: { read: () => false } }),
  partyChanges: rel("PartyChange.booking", true)
}, true);
var BookingLine = domainList("canManageBookings", { booking: rel("Booking.lines"), name: (0, import_fields11.text)({ validation: { isRequired: true } }), unitPriceCents: money(), qty: (0, import_fields11.integer)({ validation: { min: 1, isRequired: true } }), seatsUsed: (0, import_fields11.integer)({ defaultValue: 1, validation: { min: 0 } }), kind: state(["ticket", "addon"]), feeCents: money(), taxCents: money(), totalCents: money(), currencyCode: currency(), catalogId: (0, import_fields11.text)() }, true);
var PartyChange = domainList("canManageBookings", {
  booking: rel("Booking.partyChanges"),
  source: state(["guest", "staff"]),
  status: state(["pending_payment", "applied", "cancelled", "failed"]),
  plan: (0, import_fields11.json)(),
  differenceCents: (0, import_fields11.integer)({ defaultValue: 0 }),
  collectCents: money(),
  refundCents: money(),
  keptCents: money(),
  currencyCode: currency(),
  holdId: (0, import_fields11.text)(),
  paymentIntentId: (0, import_fields11.text)(),
  clientSecret: (0, import_fields11.text)({ access: { read: () => false } }),
  expiresAt: (0, import_fields11.timestamp)(),
  reason: (0, import_fields11.text)(),
  requestKey: (0, import_fields11.text)({ isIndexed: "unique" })
}, true);

// features/keystone/models/waivers.ts
var import_fields12 = require("@keystone-6/core/fields");
var import_fields_document = require("@keystone-6/fields-document");
var Participant = domainList("canCheckIn", { booking: rel("Booking.participants"), ticketTypeSnapshot: (0, import_fields12.json)(), fullName: name(), age: (0, import_fields12.integer)({ validation: { min: 0 } }), email: (0, import_fields12.text)(), dietary: (0, import_fields12.text)(), medicalNotes: (0, import_fields12.text)({ access: { read: permissions.canReadMedicalNotes, create: () => false, update: () => false } }), waiverStatus: state(["required", "signed", "not_required"]), checkInStatus: state(["pending", "checked_in", "no_show"]), waiverTokenHash: (0, import_fields12.text)({ isIndexed: "unique", db: { isNullable: true }, access: { read: () => false } }), signatures: rel("WaiverSignature.participant", true) }, true);
var WaiverTemplate = domainList("canManageWaivers", { name: name(), version: (0, import_fields12.integer)({ defaultValue: 1, validation: { min: 1 } }), body: (0, import_fields_document.document)({ formatting: true }), bodyHash: (0, import_fields12.text)(), status: state(["draft", "published", "archived"]), tours: rel("Tour.requiresWaiver", true), signatures: rel("WaiverSignature.template", true) }, false, {
  validate: { update: ({ item, resolvedData, addValidationError }) => {
    if (item.status === "published" && Object.keys(resolvedData).some((k) => k !== "updatedAt")) addValidationError("Published waiver versions are immutable");
  } }
});
var WaiverSignature = domainList("canCheckIn", { participant: rel("Participant.signatures"), template: rel("WaiverTemplate.signatures"), templateVersion: (0, import_fields12.integer)({ validation: { isRequired: true } }), signerName: name(), isGuardian: (0, import_fields12.checkbox)({ defaultValue: false }), minorName: (0, import_fields12.text)(), signedAt: (0, import_fields12.timestamp)({ validation: { isRequired: true } }), ip: (0, import_fields12.text)(), userAgent: (0, import_fields12.text)(), bodyHash: (0, import_fields12.text)({ validation: { isRequired: true } }) }, true);

// features/keystone/models/storeLogoFields.ts
var import_fields13 = require("@keystone-6/core/fields");

// features/platform/store-settings/lib/icon-registry.ts
var LOGO_ICONS = [
  {
    id: "3portals",
    name: "3Portals",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g clip-rule="evenodd" fill-rule="evenodd"><path d="m34.5868 8.40061-9.6868-2.59556c-.6687-.17919-1.2108.23679-1.2108.92911v10.02854c0 .6923.5421 1.3988 1.2108 1.578l9.6868 2.5955c.6687.1792 1.2109-.2368 1.2109-.9291v-10.02848c0-.69232-.5422-1.39882-1.2109-1.57801zm-9.6868-6.35625c-2.6749-.71674-4.8434.94718-4.8434 3.71647v10.02847c0 2.7693 2.1685 5.5953 4.8434 6.312l9.6868 2.5956c2.6749.7168 4.8434-.9472 4.8434-3.7165v-10.0284c0-2.76934-2.1685-5.59533-4.8434-6.31207z" fill="#8098f9"/><path d="m26.9812 16.5707-12.1085-3.2444c-.6687-.1792-1.2109.2368-1.2109.9291v12.5356c0 .6923.5422 1.3988 1.2109 1.578l12.1085 3.2445c.6687.1792 1.2108-.2368 1.2108-.9291v-12.5356c0-.6924-.5421-1.3989-1.2108-1.5781zm-12.1085-7.0051c-2.6749-.71674-4.8434.9472-4.8434 3.7165v12.5356c0 2.7693 2.1685 5.5953 4.8434 6.312l12.1085 3.2445c2.6749.7167 4.8433-.9472 4.8433-3.7165v-12.5356c0-2.7693-2.1684-5.5953-4.8433-6.312z" fill="#6172f3"/><path d="m19.3736 24.7409-14.53021-3.8934c-.66873-.1792-1.21085.2368-1.21085.9291v15.0428c0 .6923.54212 1.3988 1.21085 1.578l14.53021 3.8933c.6687.1792 1.2108-.2368 1.2108-.9291v-15.0427c0-.6923-.5421-1.3988-1.2108-1.578zm-14.53021-7.6541c-2.67493-.7167-4.84339.9472-4.84339 3.7165v15.0427c0 2.7693 2.16846 5.5953 4.84339 6.3121l14.53021 3.8933c2.6749.7168 4.8433-.9472 4.8433-3.7164v-15.0428c0-2.7693-2.1684-5.5953-4.8433-6.312z" fill="#444ce7"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g clip-rule="evenodd" fill="#fff" fill-rule="evenodd"><path d="m34.5868 8.40061-9.6868-2.59556c-.6687-.17919-1.2108.23679-1.2108.92911v10.02854c0 .6923.5421 1.3988 1.2108 1.578l9.6868 2.5955c.6687.1792 1.2109-.2368 1.2109-.9291v-10.02848c0-.69232-.5422-1.39882-1.2109-1.57801zm-9.6868-6.35625c-2.6749-.71674-4.8434.94718-4.8434 3.71647v10.02847c0 2.7693 2.1685 5.5953 4.8434 6.312l9.6868 2.5956c2.6749.7168 4.8434-.9472 4.8434-3.7165v-10.0284c0-2.76934-2.1685-5.59533-4.8434-6.31207z" opacity=".5"/><path d="m26.9812 16.5707-12.1085-3.2444c-.6687-.1792-1.2109.2368-1.2109.9291v12.5356c0 .6923.5422 1.3988 1.2109 1.578l12.1085 3.2445c.6687.1792 1.2108-.2368 1.2108-.9291v-12.5356c0-.6924-.5421-1.3989-1.2108-1.5781zm-12.1085-7.0051c-2.6749-.71674-4.8434.9472-4.8434 3.7165v12.5356c0 2.7693 2.1685 5.5953 4.8434 6.312l12.1085 3.2445c2.6749.7167 4.8433-.9472 4.8433-3.7165v-12.5356c0-2.7693-2.1684-5.5953-4.8433-6.312z" opacity=".7"/><path d="m19.3736 24.7409-14.53021-3.8934c-.66873-.1792-1.21085.2368-1.21085.9291v15.0428c0 .6923.54212 1.3988 1.21085 1.578l14.53021 3.8933c.6687.1792 1.2108-.2368 1.2108-.9291v-15.0427c0-.6923-.5421-1.3988-1.2108-1.578zm-14.53021-7.6541c-2.67493-.7167-4.84339.9472-4.84339 3.7165v15.0427c0 2.7693 2.16846 5.5953 4.84339 6.3121l14.53021 3.8933c2.6749.7168 4.8433-.9472 4.8433-3.7164v-15.0428c0-2.7693-2.1684-5.5953-4.8433-6.312z"/></g></svg>`
  },
  {
    id: "45-degrees",
    name: "45 Degrees",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 24 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m0 15.8981h17.3455l-17.061314 17.0613 2.756374 2.7564 17.06134-17.0613v17.3455h.1104l3.7877-3.7877v-15.9638l-4.2485-4.2485h-15.96596l-3.78553995 3.7855z" fill="#155eef"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 24 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m0 15.8981h17.3455l-17.061314 17.0613 2.756374 2.7564 17.06134-17.0613v17.3455h.1104l3.7877-3.7877v-15.9638l-4.2485-4.2485h-15.96596l-3.78553995 3.7855z" fill="#155eef"/></svg>`
  },
  {
    id: "acme-corp",
    name: "Acme Corp",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 48 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m0 24c15.2548 0 24-8.7452 24-24 0 15.2548 8.7452 24 24 24-15.2548 0-24 8.7452-24 24 0-15.2548-8.7452-24-24-24z" fill="#155eef" fill-rule="evenodd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 48 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m0 24c15.2548 0 24-8.7452 24-24 0 15.2548 8.7452 24 24 24-15.2548 0-24 8.7452-24 24 0-15.2548-8.7452-24-24-24z" fill="#155eef" fill-rule="evenodd"/></svg>`
  },
  {
    id: "alphawave",
    name: "AlphaWave",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 47 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m24.9706 7.03309c-3.1242-3.1242-8.1896-3.1242-11.3137 0l-11.31375 11.31371c-3.124199 3.1242-3.124199 8.1895 0 11.3137l11.31375 11.3137c3.1241 3.1242 8.1895 3.1242 11.3137 0l5.3982-5.3983c-4.4939-1.7337-7.682-6.0944-7.682-11.1997 0-5.3087 3.4472-9.8123 8.2254-11.3943-.0935-.0982-.1884-.1955-.2848-.292z" fill="#155eef"/><path d="m30.3691 35.5798c1.3398.5168 2.7955.8001 4.3174.8001 6.6274 0 12-5.3726 12-12s-5.3726-12-12-12c-1.3185 0-2.5873.2126-3.774.6055 5.9623 6.2681 5.8675 16.1836-.2846 22.3356z" fill="#155eef" opacity=".7"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 47 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m24.9706 7.03309c-3.1242-3.1242-8.1896-3.1242-11.3137 0l-11.31375 11.31371c-3.124199 3.1242-3.124199 8.1895 0 11.3137l11.31375 11.3137c3.1241 3.1242 8.1895 3.1242 11.3137 0l5.3982-5.3983c-4.4939-1.7337-7.682-6.0944-7.682-11.1997 0-5.3087 3.4472-9.8123 8.2254-11.3943-.0935-.0982-.1884-.1955-.2848-.292z" fill="#155eef"/><path d="m30.3691 35.5798c1.3398.5168 2.7955.8001 4.3174.8001 6.6274 0 12-5.3726 12-12s-5.3726-12-12-12c-1.3185 0-2.5873.2126-3.774.6055 5.9623 6.2681 5.8675 16.1836-.2846 22.3356z" fill="#155eef" opacity=".7"/></svg>`
  },
  {
    id: "alt-shift",
    name: "Alt+Shift",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m23.4538 34.7189c-3.1818-1.1818-6.4544-1.3636-9.4544-.5455-2.0909.5455-4.09082 1.6364-5.90897 3l-1.27273 1.0909-.36362.3636.81816.7273c.09091 0 .09092.0909.18183.1818.18181.1818.36364.2727.63636.4545l.54542.3636.54545-.4545c.09091-.0909.27273-.2727.45454-.3636 1.63636-1.3636 3.45446-2.2727 5.36356-2.7272 2.4545-.6364 5.0908-.5455 7.7271.4545 2.1818.8182 6.6363 1.8181 11.9998-.4545l.1818-.091.2728-.2727c0-.0909.0909-.0909.1818-.1818.4545-.5454.9091-1.0909 1.2727-1.7272l1.8181-2.8182-2.909 1.6363c-4.2727 2.3636-8.1817 2.8182-12.0907 1.3637z"/><path d="m10.9998 24.9011c2.4545-.6363 5.0908-.5454 7.7272.4546 2.909 1.0909 10.3634 2.6363 18.7269-4.909l1.8182-1.8182-.1819-.4545c-.0909-.3636-.2727-.8182-.4545-1.2727l-.4545-1.2727-.9091.909c-.0909.1819-.2727.2728-.4546.4546-3.9999 4.0908-10.1816 8.2726-17.2724 5.7272-3.1817-1.1818-6.4544-1.3637-9.4544-.5455-2.909.8182-5.45442 2.3636-7.81801 4.5454v-.0909l-1.363614 1.4545c0 .0909-.090891.0909-.181798.1818l-.27274.2727.090913.3637c.090908.4545.272717.909.363625 1.3636l.545454 1.4545.90907-1.1818c.09091-.1818.27272-.2727.36363-.4545 1.90905-1.7273 4.54538-4.1818 8.27257-5.1818z"/><path d="m2.1818 23.2646c2.09088-2.1818 4.45445-3.5454 6.99987-4.2727 2.45453-.6363 5.09083-.5454 7.72713.4546 8.1817 2.9999 15.2725-1.9091 18.3633-4.5454l1.1818-1.1818.4546-.3636-.3637-.5455c-.2727-.2727-.4545-.6363-.7272-1l-.5455-.7272-.6363.6363c-.0909.0909-.2727.2727-.3637.3637-3.8181 3.6363-9.7271 7.3635-16.4542 4.8181-3.1818-1.1818-6.4544-1.3637-9.4544-.5455-1.90906.5455-3.72721 1.4545-5.54536 2.6363l-1.909065 1.5455c-.181815.1818-.272722.2727-.454537.4545l-.181799.1818v.2727c-.090907.6364-.090918 1.2727-.1818259 1.8182l-.0909131 2.2727 1.54544-1.6364c.18181-.1818.36364-.4545.63636-.6363z"/><path d="m26.0908 40.9007c-.2727-.0909-.4545-.1819-.7272-.2728-3.1818-1.1818-6.4545-1.3636-9.4545-.5454-.6363.1818-1.2726.3636-1.909.6364l-2.1818.9999-.5454.2728 1.8181.6363c.5455.1818 1.0909.3637 1.6364.5455l.2727.0909.2727-.0909c.2727-.0909.5455-.2728.8182-.2728.1818 0 .3636-.0909.5454-.1818 2.1818-.5454 4.5454-.5454 7.0908.2727.2727.091.4546.1819.7273.2728l.4545.1818.2727-.0909c.6364-.1818 1.3636-.3636 1.9091-.6364l2.5454-.909-2.6363-.6364c-.2727-.0909-.6364-.1818-.9091-.2727z"/><path d="m40 22.0829-1.3636 1.3636c-.1818.1818-.3636.3636-.5454.5454-3.7272 3.5454-9.7271 7.3635-16.4543 4.8181-3.1818-1.1818-6.4544-1.3636-9.4544-.5454-2.81811.8182-5.36354 2.2727-7.63623 4.4545l-1.18179 1.2727-.36362.4545.36362.5454c.27273.3637.45455.6364.63637 1l.54542.8182.63636-.8182c.09091-.0909.27272-.2727.36363-.3636 2.18178-2.3636 4.54534-3.8181 7.27264-4.5454 2.4545-.6364 5.0908-.5454 7.7271.4545 2.2727.8182 4.6363 1.0909 6.9999.8182 4.1817-.4545 8.3635-2.8181 11.4543-5.4544.1819-.1818.3636-.2727.5455-.4546l.2727-.2727v-.2727c0-.5455.0909-1.1818.0909-1.7273z"/><path d="m5.45373 13.7196c.54545-.2728 1.18182-.4546 1.72726-.6364 2.45451-.6364 5.09081-.5455 7.72711.4545 1.7273.6364 3.4545.9091 5.3636.9091 3.8181 0 7.6362-1.3636 11.1816-3.9999l1.8181-1.45455-.8181-.63636c-.2727-.27273-.6364-.54544-1-.72725l-.5455-.36363-.4545.36363c-.1818.09091-.2727.27272-.4545.36362-4.8181 3.63634-9.6362 4.63634-14.1816 2.90904-3.2727-1.18178-6.54535-1.45451-9.81802-.4545-.27272.0909-.54544.1818-.90907.2727l-.1818.0909-.27274.2727c0 .0909-.09089.0909-.1818.1818-.36363.5455-.81818 1-1.18181 1.5455l-1.72724 2.6363 2.81814-1.4545c.45453 0 .81815-.1818 1.09087-.2727z"/><path d="m12.9089 7.53769.2727.09091c1.1818.45454 3 .90907 5.2726.90907 2.3636 0 4.6363-.54545 6.909-1.45452l2.8181-1.36361-1.909-.63634c-.5454-.18182-1.0909-.36363-1.7273-.45454h-.2727l-.2727.09089c-.2727.0909-.5455.27274-.8182.36365-2.7272.99998-5.4544 1.1818-8.0907.45454-.2728-.09091-.5455-.18183-.8182-.27274l-.2727-.09091-.2728.09091c-.5454.18181-1.0908.36364-1.6363.63636l-2.09087.90908 2.18177.63633c.1818-.0909.4546.00001.7273.09092z"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m23.4538 34.7189c-3.1818-1.1818-6.4544-1.3636-9.4544-.5455-2.0909.5455-4.09082 1.6364-5.90897 3l-1.27273 1.0909-.36362.3636.81816.7273c.09091 0 .09092.0909.18183.1818.18181.1818.36364.2727.63636.4545l.54542.3636.54545-.4545c.09091-.0909.27273-.2727.45454-.3636 1.63636-1.3636 3.45446-2.2727 5.36356-2.7272 2.4545-.6364 5.0908-.5455 7.7271.4545 2.1818.8182 6.6363 1.8181 11.9998-.4545l.1818-.091.2728-.2727c0-.0909.0909-.0909.1818-.1818.4545-.5454.9091-1.0909 1.2727-1.7272l1.8181-2.8182-2.909 1.6363c-4.2727 2.3636-8.1817 2.8182-12.0907 1.3637z"/><path d="m10.9998 24.9011c2.4545-.6363 5.0908-.5454 7.7272.4546 2.909 1.0909 10.3634 2.6363 18.7269-4.909l1.8182-1.8182-.1819-.4545c-.0909-.3636-.2727-.8182-.4545-1.2727l-.4545-1.2727-.9091.909c-.0909.1819-.2727.2728-.4546.4546-3.9999 4.0908-10.1816 8.2726-17.2724 5.7272-3.1817-1.1818-6.4544-1.3637-9.4544-.5455-2.909.8182-5.45442 2.3636-7.81801 4.5454v-.0909l-1.363614 1.4545c0 .0909-.090891.0909-.181798.1818l-.27274.2727.090913.3637c.090908.4545.272717.909.363625 1.3636l.545454 1.4545.90907-1.1818c.09091-.1818.27272-.2727.36363-.4545 1.90905-1.7273 4.54538-4.1818 8.27257-5.1818z"/><path d="m2.1818 23.2646c2.09088-2.1818 4.45445-3.5454 6.99987-4.2727 2.45453-.6363 5.09083-.5454 7.72713.4546 8.1817 2.9999 15.2725-1.9091 18.3633-4.5454l1.1818-1.1818.4546-.3636-.3637-.5455c-.2727-.2727-.4545-.6363-.7272-1l-.5455-.7272-.6363.6363c-.0909.0909-.2727.2727-.3637.3637-3.8181 3.6363-9.7271 7.3635-16.4542 4.8181-3.1818-1.1818-6.4544-1.3637-9.4544-.5455-1.90906.5455-3.72721 1.4545-5.54536 2.6363l-1.909065 1.5455c-.181815.1818-.272722.2727-.454537.4545l-.181799.1818v.2727c-.090907.6364-.090918 1.2727-.1818259 1.8182l-.0909131 2.2727 1.54544-1.6364c.18181-.1818.36364-.4545.63636-.6363z"/><path d="m26.0908 40.9007c-.2727-.0909-.4545-.1819-.7272-.2728-3.1818-1.1818-6.4545-1.3636-9.4545-.5454-.6363.1818-1.2726.3636-1.909.6364l-2.1818.9999-.5454.2728 1.8181.6363c.5455.1818 1.0909.3637 1.6364.5455l.2727.0909.2727-.0909c.2727-.0909.5455-.2728.8182-.2728.1818 0 .3636-.0909.5454-.1818 2.1818-.5454 4.5454-.5454 7.0908.2727.2727.091.4546.1819.7273.2728l.4545.1818.2727-.0909c.6364-.1818 1.3636-.3636 1.9091-.6364l2.5454-.909-2.6363-.6364c-.2727-.0909-.6364-.1818-.9091-.2727z"/><path d="m40 22.0829-1.3636 1.3636c-.1818.1818-.3636.3636-.5454.5454-3.7272 3.5454-9.7271 7.3635-16.4543 4.8181-3.1818-1.1818-6.4544-1.3636-9.4544-.5454-2.81811.8182-5.36354 2.2727-7.63623 4.4545l-1.18179 1.2727-.36362.4545.36362.5454c.27273.3637.45455.6364.63637 1l.54542.8182.63636-.8182c.09091-.0909.27272-.2727.36363-.3636 2.18178-2.3636 4.54534-3.8181 7.27264-4.5454 2.4545-.6364 5.0908-.5454 7.7271.4545 2.2727.8182 4.6363 1.0909 6.9999.8182 4.1817-.4545 8.3635-2.8181 11.4543-5.4544.1819-.1818.3636-.2727.5455-.4546l.2727-.2727v-.2727c0-.5455.0909-1.1818.0909-1.7273z"/><path d="m5.45373 13.7196c.54545-.2728 1.18182-.4546 1.72726-.6364 2.45451-.6364 5.09081-.5455 7.72711.4545 1.7273.6364 3.4545.9091 5.3636.9091 3.8181 0 7.6362-1.3636 11.1816-3.9999l1.8181-1.45455-.8181-.63636c-.2728-.27273-.6364-.54544-1-.72725l-.5455-.36363-.4545.36363c-.1818.09091-.2727.27272-.4545.36362-4.8181 3.63634-9.6362 4.63634-14.1816 2.90904-3.2727-1.18178-6.54535-1.45451-9.81802-.4545-.27272.0909-.54544.1818-.90907.2727l-.1818.0909-.27274.2727c0 .0909-.09089.0909-.1818.1818-.36363.5455-.81818 1-1.18181 1.5455l-1.72724 2.6363 2.81814-1.4545c.45453 0 .81815-.1818 1.09087-.2727z"/><path d="m12.9089 7.53769.2727.09091c1.1818.45454 3 .90907 5.2726.90907 2.3636 0 4.6363-.54545 6.909-1.45452l2.8181-1.36361-1.909-.63634c-.5454-.18182-1.0909-.36363-1.7273-.45454h-.2727l-.2727.09089c-.2727.0909-.5455.27274-.8182.36365-2.7272.99998-5.4544 1.1818-8.0907.45454-.2728-.09091-.5455-.18183-.8182-.27274l-.2727-.09091-.2728.09091c-.5454.18181-1.0908.36364-1.6363.63636l-2.09087.90908 2.18177.63633c.1818-.0909.4546.00001.7273.09092z"/></g></svg>`
  },
  {
    id: "biosynthesis",
    name: "Biosynthesis",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g clip-rule="evenodd" fill-rule="evenodd"><path d="m4.29111 28.6025c.90712.9019.9071 2.3641-.00003 3.266l-.04646.0462c-.90713.9019-2.37788.9018-3.284994-.0001-.9071177-.9019-.9071038-2.3641.000031-3.266l.046453-.0462c.90714-.9019 2.37788-.9018 3.285.0001z" fill="#a4bcfd"/><path d="m15.2112 29.298c.9055.9035.9028 2.3658-.006 3.266l-6.43424 6.3741c-.90876.9002-2.3795.8976-3.28499-.0059-.90548-.9035-.90282-2.3658.00594-3.266l6.43429-6.3741c.9088-.9002 2.3795-.8976 3.285.0059z" fill="#6172f3"/><path d="m23.9431 40.2706c.7116-1.0613 2.1538-1.348 3.2212-.6405l.1394.0923c1.0674.7075 1.3558 2.1414.6442 3.2026-.7116 1.0613-2.1538 1.3481-3.2212.6406l-.1394-.0924c-1.0674-.7075-1.3558-2.1414-.6442-3.2026z" fill="#a4bcfd"/><path d="m39.2728 28.4638c.9072.9019.9072 2.3641 0 3.266l-3.159 3.1408c-.9072.9019-2.3779.9019-3.285 0s-.9071-2.3641 0-3.266l3.1591-3.1408c.9071-.9019 2.3778-.9019 3.2849 0z" fill="#6172f3"/><g fill="#444ce7"><path d="m39.3197 16.8473c.9071.9019.9071 2.3642 0 3.266l-23.3446 23.2098c-.9071.9019-2.3779.9019-3.285 0s-.9071-2.3641 0-3.266l23.3446-23.2098c.9071-.9019 2.3778-.9019 3.285 0z"/><path d="m34.905 9.71133c.9072.90187.9072 2.36417 0 3.26607l-13.426 13.3485c-.9071.9019-2.3779.9019-3.285 0s-.9071-2.3642 0-3.2661l13.4261-13.34847c.9071-.90189 2.3778-.90189 3.2849 0z"/><path d="m27.8187 5.18362c.9077.90128.9087 2.36353.0022 3.26603l-17.2588 17.18215c-.90647.9025-2.37721.9035-3.28495.0022-.90773-.9013-.90872-2.3635-.00221-3.266l17.25876-17.18218c.9065-.9025 2.3772-.90348 3.285-.0022z"/></g><path d="m10.7276 10.6841c.9056.9035.9031 2.3657-.0056 3.266l-6.75949 6.6974c-.90869.9003-2.37943.8978-3.28499-.0056-.905563-.9035-.903032-2.3657.005654-3.2661l6.759476-6.6973c.90868-.90034 2.37942-.89783 3.28495.0056z" fill="#6172f3"/><path d="m14.8678 4.00024c1.2828 0 2.3228 1.03397 2.3228 2.30944v.23094c0 1.27546-1.04 2.30943-2.3228 2.30943-1.2829 0-2.3229-1.03397-2.3229-2.30943v-.23094c0-1.27547 1.04-2.30944 2.3229-2.30944z" fill="#a4bcfd"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g clip-rule="evenodd" fill="#fff" fill-rule="evenodd"><path d="m4.29111 28.6025c.90712.9019.9071 2.3641-.00003 3.266l-.04646.0462c-.90713.9019-2.37788.9018-3.284994-.0001-.9071177-.9019-.9071038-2.3641.000031-3.266l.046453-.0462c.90714-.9019 2.37788-.9018 3.285.0001z" opacity=".5"/><path d="m15.2112 29.298c.9055.9035.9028 2.3658-.006 3.266l-6.43424 6.3741c-.90876.9002-2.3795.8976-3.28499-.0059-.90548-.9035-.90282-2.3658.00594-3.266l6.43429-6.3741c.9088-.9002 2.3795-.8976 3.285.0059z" opacity=".7"/><path d="m23.9431 40.2706c.7116-1.0613 2.1538-1.348 3.2212-.6405l.1394.0923c1.0674.7075 1.3558 2.1414.6442 3.2026-.7116 1.0613-2.1538 1.3481-3.2212.6406l-.1394-.0924c-1.0674-.7075-1.3558-2.1414-.6442-3.2026z" opacity=".5"/><path d="m39.2728 28.4638c.9072.9019.9072 2.3641 0 3.266l-3.159 3.1408c-.9072.9019-2.3779.9019-3.285 0s-.9071-2.3641 0-3.266l3.1591-3.1408c.9071-.9019 2.3778-.9019 3.2849 0z" opacity=".7"/><path d="m39.3197 16.8473c.9071.9019.9071 2.3642 0 3.266l-23.3446 23.2098c-.9071.9019-2.3779.9019-3.285 0s-.9071-2.3641 0-3.266l23.3446-23.2098c.9071-.9019 2.3778-.9019 3.285 0z"/><path d="m34.905 9.71133c.9072.90187.9072 2.36417 0 3.26607l-13.426 13.3485c-.9071.9019-2.3779.9019-3.285 0s-.9071-2.3642 0-3.2661l13.4261-13.34847c.9071-.90189 2.3778-.90189 3.2849 0z"/><path d="m27.8187 5.18362c.9077.90128.9087 2.36353.0022 3.26603l-17.2588 17.18215c-.90647.9025-2.37721.9035-3.28495.0022-.90773-.9013-.90872-2.3635-.00221-3.266l17.25876-17.18218c.9065-.9025 2.3772-.90348 3.285-.0022z"/><path d="m10.7276 10.6841c.9056.9035.9031 2.3657-.0056 3.266l-6.75949 6.6974c-.90869.9003-2.37943.8978-3.28499-.0056-.905563-.9035-.903032-2.3657.005654-3.2661l6.759476-6.6973c.90868-.90034 2.37942-.89783 3.28495.0056z" opacity=".7"/><path d="m14.8678 4.00024c1.2828 0 2.3228 1.03397 2.3228 2.30944v.23094c0 1.27546-1.04 2.30943-2.3228 2.30943-1.2829 0-2.3229-1.03397-2.3229-2.30943v-.23094c0-1.27547 1.04-2.30944 2.3229-2.30944z" opacity=".5"/></g></svg>`
  },
  {
    id: "boltshift",
    name: "Boltshift",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m20 44c11.0457 0 20-8.9543 20-20s-8.9543-20-20-20c-11.04572 0-20 8.9543-20 20s8.95428 20 20 20zm6.2393-30.6832c.3037-1.0787-.7432-1.7167-1.6993-1.0355l-13.3469 9.5083c-1.0369.7387-.8738 2.2104.245 2.2104h3.5146v-.0272h6.8498l-5.5813 1.9693-2.4605 8.7411c-.3037 1.0788.7431 1.7167 1.6993 1.0355l13.3469-9.5082c1.0369-.7387.8737-2.2105-.245-2.2105h-5.3298z" fill="#155eef" fill-rule="evenodd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m20 44c11.0457 0 20-8.9543 20-20s-8.9543-20-20-20c-11.04572 0-20 8.9543-20 20s8.95428 20 20 20zm6.2393-30.6832c.3037-1.0787-.7432-1.7167-1.6993-1.0355l-13.3469 9.5083c-1.0369.7387-.8738 2.2104.245 2.2104h3.5146v-.0272h6.8498l-5.5813 1.9693-2.4605 8.7411c-.3037 1.0788.7431 1.7167 1.6993 1.0355l13.3469-9.5082c1.0369-.7387.8737-2.2105-.245-2.2105h-5.3298z" fill="#fff" fill-rule="evenodd"/></svg>`
  },
  {
    id: "buildingblocks",
    name: "BuildingBlocks",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 37 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m12.8841 4.30945-6.8842 3.97574 6.8891 3.97661 6.8862-3.97575zm8.8919 7.44025-6.887 3.9762-.0007 7.9532 6.8877-3.9771zm2 11.4164-6.8879 3.9772 6.8889 3.9765 6.8871-3.9763zm8.8879 7.4416-6.8868 3.9761v7.9522l6.8868-3.9761zm-10.8868 11.9287v-7.9525l-6.8891-3.9766v7.9525zm-10.8888-18.8569-6.8883-3.9775v-7.9526l6.889 3.9765zm-.0003 4.6187-9.38814-5.4209c-.928127-.5359-1.49986-1.5262-1.49986-2.598v-11.99368c0-.71444.381106-1.37463.999789-1.73193l10.383811-5.996798c.9281-.5359626 2.0716-.5361538 2.9998-.000505l10.3922 5.996973c.619.3572 1.0004 1.01758 1.0004 1.73226v11.41638l9.888 5.7096c.6188.3573.9999 1.0175.9999 1.732v11.9937c0 1.0718-.5718 2.0621-1.5 2.598l-10.3868 5.9969c-.6187.3572-1.381.3572-1.9998.0001l-10.3891-5.9969c-.9283-.5358-1.5002-1.5263-1.5002-2.5982z" fill="#155eef" fill-rule="evenodd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 37 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m12.8841 4.30945-6.8842 3.97574 6.8891 3.97661 6.8862-3.97575zm8.8919 7.44025-6.887 3.9762-.0007 7.9532 6.8877-3.9771zm2 11.4164-6.8879 3.9772 6.8889 3.9765 6.8871-3.9763zm8.8879 7.4416-6.8868 3.9761v7.9522l6.8868-3.9761zm-10.8868 11.9287v-7.9525l-6.8891-3.9766v7.9525zm-10.8888-18.8569-6.8883-3.9775v-7.9526l6.889 3.9765zm-.0003 4.6187-9.38814-5.4209c-.928127-.5359-1.49986-1.5262-1.49986-2.598v-11.99368c0-.71444.381106-1.37463.999789-1.73193l10.383811-5.996798c.9281-.5359626 2.0716-.5361538 2.9998-.000505l10.3922 5.996973c.619.3572 1.0004 1.01758 1.0004 1.73226v11.41638l9.888 5.7096c.6188.3573.9999 1.0175.9999 1.732v11.9937c0 1.0718-.5718 2.0621-1.5 2.598l-10.3868 5.9969c-.6187.3572-1.381.3572-1.9998.0001l-10.3891-5.9969c-.9283-.5358-1.5002-1.5263-1.5002-2.5982z" fill="#155eef" fill-rule="evenodd"/></svg>`
  },
  {
    id: "calescence",
    name: "Calescence",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 36 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g clip-rule="evenodd" fill="#1570ef" fill-rule="evenodd"><path d="m35.3721 14v8.0492h-9.9698v-2.2927z"/><path d="m35.3699 14.0001-9.9698 5.7565-7.3513-4.2436v-11.513z" opacity=".9"/><path d="m18.0512 4v11.513l-7.349 4.2436-9.969778-5.7565z" opacity=".8"/><path d="m10.7002 19.7565v8.4868l-9.969731 5.756v-19.9993z" opacity=".7"/><path d="m18.0492 32.4871v11.5129l-17.318731-10.0006 9.969731-5.756z" opacity=".6"/><path d="m35.3699 33.9994-17.3211 10.0006v-11.5129l7.3513-4.2437z" opacity=".5"/><path d="m35.3721 25.9507v8.0487l-9.9698-5.756v-2.2927z" opacity=".4"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 36 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g clip-rule="evenodd" fill="#fff" fill-rule="evenodd"><path d="m35.3721 14v8.0492h-9.9698v-2.2927z"/><path d="m35.3699 14.0001-9.9698 5.7565-7.3513-4.2436v-11.513z" opacity=".9"/><path d="m18.0512 4v11.513l-7.349 4.2436-9.969778-5.7565z" opacity=".8"/><path d="m10.7002 19.7565v8.4868l-9.969731 5.756v-19.9993z" opacity=".7"/><path d="m18.0492 32.4871v11.5129l-17.318731-10.0006 9.969731-5.756z" opacity=".6"/><path d="m35.3699 33.9994-17.3211 10.0006v-11.5129l7.3513-4.2437z" opacity=".5"/><path d="m35.3721 25.9507v8.0487l-9.9698-5.756v-2.2927z" opacity=".4"/></g></svg>`
  },
  {
    id: "capsule",
    name: "Capsule",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><circle cx="14" cy="18" fill="#1570ef" r="14"/><circle cx="26" cy="30" fill="#53b1fd" r="14"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><circle cx="14" cy="18" opacity=".7" r="14"/><circle cx="26" cy="30" opacity=".7" r="14"/></g></svg>`
  },
  {
    id: "constellation",
    name: "Constellation",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 44 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m16 8 5.0912 10.9088 10.9088 5.0912-10.9088 5.0912-5.0912 10.9088-5.0912-10.9088-10.9088-5.0912 10.9088-5.0912z"/><path d="m20.0469 31.3286 6.3539-1.0932 3.6 9.7646 3.6-9.7646 10.2565 1.7646-6.6564-8 6.6564-8-10.2565 1.7646-3.6-9.7646-3.6 9.7646-6.3539-1.0932 1.0442 2.2374 10.9088 5.0912-10.9088 5.0912z" opacity=".5"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 44 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m16 8 5.0912 10.9088 10.9088 5.0912-10.9088 5.0912-5.0912 10.9088-5.0912-10.9088-10.9088-5.0912 10.9088-5.0912z"/><path d="m20.0469 31.3286 6.3539-1.0932 3.6 9.7646 3.6-9.7646 10.2565 1.7646-6.6564-8 6.6564-8-10.2565 1.7646-3.6-9.7646-3.6 9.7646-6.3539-1.0932 1.0442 2.2374 10.9088 5.0912-10.9088 5.0912z" opacity=".5"/></g></svg>`
  },
  {
    id: "codecraft",
    name: "Codecraft",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m0 9c0-2.76142 2.23858-5 5-5h10c2.7614 0 5 2.23858 5 5v9.8192c.0002.06.0003.1203.0003.1808 0 2.7575 2.2322 4.9936 4.9881 5h.0116 10c2.7614 0 5 2.2386 5 5v10c0 2.7614-2.2386 5-5 5h-10c-2.7614 0-5-2.2386-5-5v-10c0-.0139.0001-.0277.0002-.0416-.0224-2.7422-2.2523-4.9584-4.9999-4.9584-.0129 0-.0258 0-.0387 0h-9.9616c-2.76142 0-5-2.2386-5-5z" fill="#155eef"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m0 9c0-2.76142 2.23858-5 5-5h10c2.7614 0 5 2.23858 5 5v9.8192c.0002.06.0003.1203.0003.1808 0 2.7575 2.2322 4.9936 4.9881 5h.0116 10c2.7614 0 5 2.2386 5 5v10c0 2.7614-2.2386 5-5 5h-10c-2.7614 0-5-2.2386-5-5v-10c0-.0139.0001-.0277.0002-.0416-.0224-2.7422-2.2523-4.9584-4.9999-4.9584-.0129 0-.0258 0-.0387 0h-9.9616c-2.76142 0-5-2.2386-5-5z" fill="#155eef"/></svg>`
  },
  {
    id: "command-r",
    name: "Command+R",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 32 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m18.6667 30.6667c7.3638 0 13.3333-5.9696 13.3333-13.3334 0-7.36376-5.9695-13.3333-13.3333-13.3333h-18.6667v26.6667z" fill="#155eef"/><path d="m0 4 32 40h-21.3333l-10.6667-13.3333z" fill="#2e90fa"/><path d="m21.1488 30.436c-.8042.1515-1.6339.2307-2.4821.2307h-18.6667v-26.6667z" fill="#53b1fd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 32 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m18.6667 30.6667c7.3638 0 13.3333-5.9696 13.3333-13.3334 0-7.36376-5.9695-13.3333-13.3333-13.3333h-18.6667v26.6667z" opacity=".7"/><path d="m0 4 32 40h-21.3333l-10.6667-13.3333z" opacity=".7"/><path d="m21.1488 30.436c-.8042.1515-1.6339.2307-2.4821.2307h-18.6667v-26.6667z" opacity=".7"/></g></svg>`
  },
  {
    id: "contrast-ai",
    name: "ContrastAI",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m20 4c11.0457 0 20 8.9543 20 20s-8.9543 20-20 20-20-8.9543-20-20 8.9543-20 20-20zm15 20c0 8.2843-6.7157 15-15 15v-30c8.2843 0 15 6.7157 15 15z" fill="#155eef" fill-rule="evenodd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m20 4c11.0457 0 20 8.9543 20 20s-8.9543 20-20 20-20-8.9543-20-20 8.9543-20 20-20zm15 20c0 8.2843-6.7157 15-15 15v-30c8.2843 0 15 6.7157 15 15z" fill="#fff" fill-rule="evenodd"/></svg>`
  },
  {
    id: "convergence",
    name: "Convergence",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 42 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m22.1017 20.8596 9.8995-9.8994-2.1213-2.12137-7.3389 7.33887v-13.1777h-3v13.1777l-7.3388-7.33887-2.1213 2.12137 9.8995 9.8994 1.0606 1.0607zm2.1207 2.1214 9.8995-9.8995 2.1213 2.1213-7.3388 7.3388h13.0956v3h-13.0956l7.3388 7.3389-2.1213 2.1213-9.8995-9.8995-1.0607-1.0607zm-16.26224 12.0208 9.89944-9.8995 1.0607-1.0607-1.0607-1.0606-9.89944-9.8995-2.12133 2.1213 7.33887 7.3388h-13.17574688v3h13.17574688l-7.33887 7.3389zm12.02024-7.7782-9.8995 9.8995 2.1213 2.1213 7.3388-7.3388v13.0944h3v-13.0944l7.3389 7.3388 2.1213-2.1213-9.8995-9.8995-1.0607-1.0607z" fill="#155eef" fill-rule="evenodd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 42 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m22.1017 20.8596 9.8995-9.8994-2.1213-2.12137-7.3389 7.33887v-13.1777h-3v13.1777l-7.3388-7.33887-2.1213 2.12137 9.8995 9.8994 1.0606 1.0607zm2.1207 2.1214 9.8995-9.8995 2.1213 2.1213-7.3388 7.3388h13.0956v3h-13.0956l7.3388 7.3389-2.1213 2.1213-9.8995-9.8995-1.0607-1.0607zm-16.26224 12.0208 9.89944-9.8995 1.0607-1.0607-1.0607-1.0606-9.89944-9.8995-2.12133 2.1213 7.33887 7.3388h-13.17574688v3h13.17574688l-7.33887 7.3389zm12.02024-7.7782-9.8995 9.8995 2.1213 2.1213 7.3388-7.3388v13.0944h3v-13.0944l7.3389 7.3388 2.1213-2.1213-9.8995-9.8995-1.0607-1.0607z" fill="#155eef" fill-rule="evenodd"/></svg>`
  },
  {
    id: "core-os",
    name: "CoreOS",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 42 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m15.2286 4.99951c-3.2154 0-6.18655 1.71539-7.79425 4.5l-5.7735 9.99999c-1.6076941 2.7846-1.607697 6.2154 0 9l5.7735 10c1.6077 2.7846 4.57885 4.5 7.79425 4.5h11.547c3.2154 0 6.1865-1.7154 7.7942-4.5l5.7735-10c1.6077-2.7846 1.6077-6.2154 0-9l-5.7735-9.99999c-1.6077-2.78461-4.5788-4.5-7.7942-4.5zm11.547 5.99999h-7.2169c-1.1547 0-1.8762 1.2499-1.298 2.2494 1.784 3.0838 3.5722 6.1653 5.3536 9.2506.5359.9282.5359 2.0718 0 3-1.7814 3.0854-3.5696 6.1668-5.3536 9.2506-.5782.9995.1433 2.2494 1.298 2.2494h7.2169c1.0718 0 2.0622-.5718 2.5981-1.5l5.7735-10c.5359-.9282.5359-2.0718 0-3l-5.7735-10c-.5359-.9282-1.5263-1.5-2.5981-1.5z" fill="#155eef" fill-rule="evenodd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 42 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m15.2286 4.99951c-3.2154 0-6.18655 1.71539-7.79425 4.5l-5.7735 9.99999c-1.6076941 2.7846-1.607697 6.2154 0 9l5.7735 10c1.6077 2.7846 4.57885 4.5 7.79425 4.5h11.547c3.2154 0 6.1865-1.7154 7.7942-4.5l5.7735-10c1.6077-2.7846 1.6077-6.2154 0-9l-5.7735-9.99999c-1.6077-2.78461-4.5788-4.5-7.7942-4.5zm11.547 5.99999h-7.2169c-1.1547 0-1.8762 1.2499-1.298 2.2494 1.784 3.0838 3.5722 6.1653 5.3536 9.2506.5359.9282.5359 2.0718 0 3-1.7814 3.0854-3.5696 6.1668-5.3536 9.2506-.5782.9995.1433 2.2494 1.298 2.2494h7.2169c1.0718 0 2.0622-.5718 2.5981-1.5l5.7735-10c.5359-.9282.5359-2.0718 0-3l-5.7735-10c-.5359-.9282-1.5263-1.5-2.5981-1.5z" fill="#155eef" fill-rule="evenodd"/></svg>`
  },
  {
    id: "cubekit",
    name: "Cubekit",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m0 14.5264v18.9473l17.8947-12.2437v-18.94741z" fill="#155eef" opacity=".5"/><path d="m0 33.4737v-18.9474l17.8947 12.2438v18.9474z" fill="#1570ef" opacity=".5"/><path d="m40 14.5263v18.9474l-17.8947-12.2438v-18.94737z" fill="#155eef" opacity=".5"/><path d="m40 33.4737v-18.9474l-17.8947 12.2438v18.9474z" fill="#1570ef" opacity=".5"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m0 14.5264v18.9473l17.8947-12.2437v-18.94741z" opacity=".5"/><path d="m0 33.4737v-18.9474l17.8947 12.2438v18.9474z" opacity=".5"/><path d="m40 14.5263v18.9474l-17.8947-12.2438v-18.94737z" opacity=".5"/><path d="m40 33.4737v-18.9474l-17.8947 12.2438v18.9474z" opacity=".5"/></g></svg>`
  },
  {
    id: "europa",
    name: "Europa",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m28.6446 39.168c-.6032 1.3404-1.353 2.6531-2.2519 3.7888 7.4581-2.5137 12.9483-9.3054 13.5527-17.4568h-2.6549c-3.2399 0-5.8424 2.5861-6.369 5.7829-.4855 2.9468-1.2621 5.6301-2.2769 7.8851z"/><path d="m22.7724 25.5c3.3921 0 6.167 2.8299 5.5439 6.1643-1.3533 7.2424-4.5667 12.3357-8.3155 12.3357-4.7435 0-8.6299-8.1549-8.975-18.5z"/><path d="m30.9904 17.1502c.4961 3.2267 3.1106 5.8498 6.3752 5.8498h2.6107c-.4123-8.3729-5.9735-15.39183-13.5836-17.95683.8989 1.13575 1.6487 2.44843 2.2519 3.78878 1.0643 2.36505 1.8666 5.20115 2.3458 8.31825z"/><path d="m28.4165 16.8957c.5674 3.3176-2.1954 6.1043-5.5612 6.1043h-11.8434c.2344-10.5811 4.1693-19 8.9889-19 3.8447 0 7.1263 5.35721 8.4157 12.8957z"/><path d="m8.51131 23c.11359-5.4083 1.14536-10.3894 2.84579-14.16805.6031-1.34035 1.3529-2.65303 2.2519-3.78878-7.61011 2.565-13.171316 9.58393-13.5836094 17.95683z"/><path d="m.0562286 25.5c.6043994 8.1514 6.0946514 14.9431 13.5527714 17.4568-.899-1.1357-1.6488-2.4484-2.2519-3.7888-1.6479-3.6619-2.66781-8.4531-2.83264-13.668z"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m28.6446 39.168c-.6032 1.3404-1.353 2.6531-2.2519 3.7888 7.4581-2.5137 12.9483-9.3054 13.5527-17.4568h-2.6549c-3.2399 0-5.8424 2.5861-6.369 5.7829-.4855 2.9468-1.2621 5.6301-2.2769 7.8851z"/><path d="m22.7724 25.5c3.3921 0 6.167 2.8299 5.5439 6.1643-1.3533 7.2424-4.5667 12.3357-8.3155 12.3357-4.7435 0-8.6299-8.1549-8.975-18.5z"/><path d="m30.9904 17.1502c.4961 3.2267 3.1106 5.8498 6.3752 5.8498h2.6107c-.4123-8.3729-5.9735-15.39183-13.5836-17.95683.8989 1.13575 1.6487 2.44843 2.2519 3.78878 1.0643 2.36505 1.8666 5.20115 2.3458 8.31825z"/><path d="m28.4165 16.8957c.5674 3.3176-2.1954 6.1043-5.5612 6.1043h-11.8434c.2344-10.5811 4.1693-19 8.9889-19 3.8447 0 7.1263 5.35721 8.4157 12.8957z"/><path d="m8.51131 23c.11359-5.4083 1.14536-10.3894 2.84579-14.16805.6031-1.34035 1.3529-2.65303 2.2519-3.78878-7.61011 2.565-13.171316 9.58393-13.5836094 17.95683z"/><path d="m.0562286 25.5c.6043994 8.1514 6.0946514 14.9431 13.5527714 17.4568-.899-1.1357-1.6488-2.4484-2.2519-3.7888-1.6479-3.6619-2.66781-8.4531-2.83264-13.668z"/></g></svg>`
  },
  {
    id: "feather-dev",
    name: "FeatherDev",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 44 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m36.3068 11.4224c-.4322-.4323-.8644-.8645-1.2967-1.2967-1.2966-1.38311-2.6797-2.76621-4.4086-3.63065-1.9882-1.03733-4.1493-.778-6.3104-.778-3.2849 0-11.4971 0-16.33798 0l3.28488 4.40865h19.6228c1.8153 0 3.3713.3458 4.8409 1.2967.2593.0864.5186.0864.6051 0z" fill="#53b1fd"/><path d="m39.9368 18.511c-.4322-.4322-.8645-.8645-1.2967-1.2967-1.2967-1.3831-2.6797-2.7662-4.4086-3.6306-1.9882-1.0374-4.1494-.778-6.3105-.778-2.8526 0-9.6817 0-14.5226 0l3.2849 4.4086h17.8939c1.8154 0 3.3714.3458 4.8409 1.2967.1729.0864.3458.0864.5187 0z" fill="#2e90fa"/><path d="m44 25.4263c-.4322-.4323-.8645-.8645-1.2967-1.2967-1.2966-1.3831-2.6797-2.7662-4.4086-3.6307-1.9882-1.0373-4.1493-.7779-6.3104-.7779-2.6798 0-8.558 0-13.3124 0l3.2848 4.4086h16.5973c1.8153 0 3.3713.3458 4.8409 1.2967.2593.0864.4322.1729.6051 0z" fill="#1570ef"/><path d="m7.60742 37.0961c.43222.4322.86444.8644 1.29666 1.2966 1.29662 1.3831 2.67972 2.7662 4.40862 3.6307 1.9882 1.0373 4.1493.778 6.3104.778h16.338l-3.2849-4.4087c-5.9646 0-15.3006 0-19.6228 0-1.8153 0-3.37132-.3457-4.84087-1.2966-.25933-.0865-.43222-.0865-.60511 0z" fill="#53b1fd"/><path d="m3.97656 30.0079c.43222.4323.86444.8645 1.29666 1.2967 1.29667 1.3831 2.67976 2.7662 4.40864 3.6307 1.98824 1.0373 4.14934.778 6.31044.778h14.5226l-3.2849-4.4087c-5.8782 0-13.9175 0-17.89391 0-1.81532 0-3.37132-.3458-4.84087-1.2967-.17289-.0864-.34577-.0864-.51866 0z" fill="#2e90fa"/><path d="m0 23.0058c.43222.4322.864441.8644 1.29666 1.2966 1.29666 1.3831 2.67977 2.7662 4.40866 3.6307 1.98821 1.0373 4.1493.778 6.31038.778h13.3124l-3.2849-4.4087c-5.7053 0-12.96657 0-16.59722 0-1.81533 0-3.37132-.3458-4.840874-1.2966-.259332-.0865-.432218-.0865-.605106 0z" fill="#1570ef"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 44 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m36.3068 11.4224c-.4322-.4323-.8644-.8645-1.2967-1.2967-1.2966-1.38311-2.6797-2.76621-4.4086-3.63065-1.9882-1.03733-4.1493-.778-6.3104-.778-3.2849 0-11.4971 0-16.33798 0l3.28488 4.40865h19.6228c1.8153 0 3.3713.3458 4.8409 1.2967.2593.0864.5186.0864.6051 0z" opacity=".5"/><path d="m39.9368 18.511c-.4322-.4322-.8645-.8645-1.2967-1.2967-1.2967-1.3831-2.6797-2.7662-4.4086-3.6306-1.9882-1.0374-4.1494-.778-6.3105-.778-2.8526 0-9.6817 0-14.5226 0l3.2849 4.4086h17.8939c1.8154 0 3.3714.3458 4.8409 1.2967.1729.0864.3458.0864.5187 0z" opacity=".7"/><path d="m44 25.4263c-.4322-.4323-.8645-.8645-1.2967-1.2967-1.2966-1.3831-2.6797-2.7662-4.4086-3.6307-1.9882-1.0373-4.1493-.7779-6.3104-.7779-2.6798 0-8.558 0-13.3124 0l3.2848 4.4086h16.5973c1.8153 0 3.3713.3458 4.8409 1.2967.2593.0864.4322.1729.6051 0z"/><path d="m7.60742 37.0961c.43222.4322.86444.8644 1.29666 1.2966 1.29662 1.3832 2.67972 2.7662 4.40862 3.6307 1.9882 1.0373 4.1493.778 6.3104.778h16.338l-3.2849-4.4087c-5.9646 0-15.3006 0-19.6228 0-1.8153 0-3.37132-.3457-4.84087-1.2966-.25933-.0865-.43222-.0865-.60511 0z" opacity=".5"/><path d="m3.97656 30.0079c.43222.4323.86444.8645 1.29666 1.2967 1.29667 1.3831 2.67976 2.7662 4.40864 3.6307 1.98824 1.0373 4.14934.778 6.31044.778h14.5226l-3.2849-4.4087c-5.8782 0-13.9175 0-17.89391 0-1.81532 0-3.37132-.3458-4.84087-1.2967-.17289-.0864-.34577-.0864-.51866 0z" opacity=".7"/><path d="m0 23.0058c.43222.4322.864441.8644 1.29666 1.2966 1.29666 1.3831 2.67977 2.7662 4.40866 3.6307 1.98821 1.0373 4.1493.778 6.31038.778h13.3124l-3.2849-4.4087c-5.7053 0-12.96657 0-16.59722 0-1.81533 0-3.37132-.3458-4.840874-1.2966-.259332-.0865-.432218-.0865-.605106 0z"/></g></svg>`
  },
  {
    id: "flora-fauna",
    name: "Flora&Fauna",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m13.7146 4c-2.2564 0-4.4203.89634-6.01579 2.49183l-7.69881 7.69877v3.524c0 2.4897 1.06944 4.7296 2.77401 6.2854-1.70457 1.5558-2.77401 3.7957-2.77401 6.2854v3.524l7.69881 7.6988c1.59549 1.5955 3.75939 2.4918 6.01579 2.4918 2.4897 0 4.7296-1.0694 6.2854-2.774 1.5558 1.7046 3.7957 2.774 6.2854 2.774 2.2564 0 4.4203-.8963 6.0158-2.4918l7.6988-7.6988v-3.524c0-2.4897-1.0694-4.7296-2.774-6.2854 1.7046-1.5558 2.774-3.7957 2.774-6.2854v-3.524l-7.6988-7.69877c-1.5955-1.59549-3.7594-2.49183-6.0158-2.49183-2.4897 0-4.7296 1.06944-6.2854 2.77401-1.5558-1.70457-3.7957-2.77401-6.2854-2.77401zm12.0442 20c-.0959-.0875-.19-.1774-.2822-.2696l-5.4766-5.4766-5.4766 5.4766c-.0922.0922-.1863.1821-.2822.2696.0959.0875.19.1774.2822.2696l5.4766 5.4766 5.4766-5.4766c.0922-.0922.1863-.1821.2822-.2696zm-3.5366 9.8094v1.683c0 2.244 1.8192 4.0632 4.0632 4.0632 1.0776 0 2.1111-.4281 2.8731-1.1901l6.3971-6.3971v-1.683c0-2.244-1.8192-4.0632-4.0632-4.0632-1.0776 0-2.1111.4281-2.8731 1.1901zm-4.4444 0-6.3971-6.3971c-.762-.762-1.79546-1.1901-2.87308-1.1901-2.24403 0-4.06318 1.8192-4.06318 4.0632v1.683l6.39706 6.3971c.762.762 1.7955 1.1901 2.8731 1.1901 2.244 0 4.0632-1.8192 4.0632-4.0632zm0-21.3018v1.683l-6.3971 6.3971c-.762.762-1.79546 1.1901-2.87308 1.1901-2.24403 0-4.06318-1.8192-4.06318-4.0632v-1.683l6.39706-6.39708c.762-.76199 1.7955-1.19007 2.8731-1.19007 2.244 0 4.0632 1.81915 4.0632 4.06315zm10.8415 8.0801-6.3971-6.3971v-1.683c0-2.244 1.8192-4.06315 4.0632-4.06315 1.0776 0 2.1111.42808 2.8731 1.19007l6.3971 6.39708v1.683c0 2.244-1.8192 4.0632-4.0632 4.0632-1.0776 0-2.1111-.4281-2.8731-1.1901z" fill="#155eef" fill-rule="evenodd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m13.7146 4c-2.2564 0-4.4203.89634-6.01579 2.49183l-7.69881 7.69877v3.524c0 2.4897 1.06944 4.7296 2.77401 6.2854-1.70457 1.5558-2.77401 3.7957-2.77401 6.2854v3.524l7.69881 7.6988c1.59549 1.5955 3.75939 2.4918 6.01579 2.4918 2.4897 0 4.7296-1.0694 6.2854-2.774 1.5558 1.7046 3.7957 2.774 6.2854 2.774 2.2564 0 4.4203-.8963 6.0158-2.4918l7.6988-7.6988v-3.524c0-2.4897-1.0694-4.7296-2.774-6.2854 1.7046-1.5558 2.774-3.7957 2.774-6.2854v-3.524l-7.6988-7.69877c-1.5955-1.59549-3.7594-2.49183-6.0158-2.49183-2.4897 0-4.7296 1.06944-6.2854 2.77401-1.5558-1.70457-3.7957-2.77401-6.2854-2.77401zm12.0442 20c-.0959-.0875-.19-.1774-.2822-.2696l-5.4766-5.4766-5.4766 5.4766c-.0922.0922-.1863.1821-.2822.2696.0959.0875.19.1774.2822.2696l5.4766 5.4766 5.4766-5.4766c.0922-.0922.1863-.1821.2822-.2696zm-3.5366 9.8094v1.683c0 2.244 1.8192 4.0632 4.0632 4.0632 1.0776 0 2.1111-.4281 2.8731-1.1901l6.3971-6.3971v-1.683c0-2.244-1.8192-4.0632-4.0632-4.0632-1.0776 0-2.1111.4281-2.8731 1.1901zm-4.4444 0-6.3971-6.3971c-.762-.762-1.79546-1.1901-2.87308-1.1901-2.24403 0-4.06318 1.8192-4.06318 4.0632v1.683l6.39706 6.3971c.762.762 1.7955 1.1901 2.8731 1.1901 2.244 0 4.0632-1.8192 4.0632-4.0632zm0-21.3018v1.683l-6.3971 6.3971c-.762.762-1.79546 1.1901-2.87308 1.1901-2.24403 0-4.06318-1.8192-4.06318-4.0632v-1.683l6.39706-6.39708c.762-.76199 1.7955-1.19007 2.8731-1.19007 2.244 0 4.0632 1.81915 4.0632 4.06315zm10.8415 8.0801-6.3971-6.3971v-1.683c0-2.244 1.8192-4.06315 4.0632-4.06315 1.0776 0 2.1111.42808 2.8731 1.19007l6.3971 6.39708v1.683c0 2.244-1.8192 4.0632-4.0632 4.0632-1.0776 0-2.1111-.4281-2.8731-1.1901z" fill="#fff" fill-rule="evenodd"/></svg>`
  },
  {
    id: "focal-point",
    name: "FocalPoint",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m10.7788 6.1817 4.6901 17.5036v-19.24382c.3719-.08679.7478-.16322 1.1273-.22897v19.47459l5.2752-19.6871c.3801.03442.7572.07945 1.1309.13479l-5.3176 19.84571 10.5701-18.30794c.3443.15492.6835.31927 1.0172.49274l-10.6095 18.3763 15.1464-15.1465c.2731.25824.5389.52407.7971.7972l-15.1486 15.1487 18.3784-10.6108c.1734.3337.3377.6729.4926 1.0173l-18.3034 10.5675 19.8403-5.3162c.0553.3737.1003.7508.1347 1.1309l-19.6869 5.2751h19.4741c-.0658.3796-.1422.7554-.229 1.1273h-19.2481l17.507 4.691c-.1798.3443-.3693.6827-.5681 1.0149l-17.2257-4.6156 14.3874 8.3066c-.2723.2801-.5528.5522-.8411.8161l-14.1087-8.1457 10.6759 10.6758c-.3377.1973-.6817.385-1.0316.5628l-10.4426-10.4426 6.8421 11.8508c-.3746.1059-.7537.2012-1.1368.2855l-6.6825-11.5744 3.2219 12.0243c-.2872.0122-.5759.0184-.8661.0184-.0991 0-.198-.0007-.2967-.0022l-3.1483-11.7497v11.4569c-.3795-.0657-.7554-.1421-1.1273-.2289v-11.2261l-2.7759 10.36c-.3541-.1396-.7033-.289-1.0471-.4478l2.7337-10.2024-5.13175 8.8884c-.3177-.2034-.62928-.4156-.9344-.6361l5.09135-8.8186-7.1301 7.1302c-.2731-.2583-.53893-.5241-.79717-.7971l7.12787-7.1279-8.81599 5.0899c-.22059-.3051-.4328-.6167-.6363-.9344l8.89259-5.1341-10.20737 2.735c-.15888-.3438-.3083-.693-.44793-1.047l10.3599-2.776h-11.226124c-.086806-.3719-.163256-.7477-.22903-1.1273h11.452154l-11.74511583-3.1471c-.00145443-.0995-.00218417-.1991-.00218417-.2989 0-.2894.00613487-.5774.0182816-.8639l12.0258184 3.2224-11.57621-6.6836c.084291-.3832.179549-.7623.285427-1.1369l11.855683 6.8449-10.44698-10.447c.17774-.3499.36544-.6939.56273-1.0315l10.68025 10.6802-8.14896-14.1144c.26387-.2882.53605-.56863.81617-.84096l8.30809 14.38996-4.61634-17.22828c.33214-.1988.67064-.38826 1.01484-.56802z" fill="#155eef"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m10.7788 6.1817 4.6901 17.5036v-19.24382c.3719-.08679.7478-.16322 1.1273-.22897v19.47459l5.2752-19.6871c.3801.03442.7572.07945 1.1309.13479l-5.3176 19.84571 10.5701-18.30794c.3443.15492.6835.31927 1.0172.49274l-10.6095 18.3763 15.1464-15.1465c.2731.25824.5389.52407.7971.7972l-15.1486 15.1487 18.3784-10.6108c.1734.3337.3377.6729.4926 1.0173l-18.3034 10.5675 19.8403-5.3162c.0553.3737.1003.7508.1347 1.1309l-19.6869 5.2751h19.4741c-.0658.3796-.1422.7554-.229 1.1273h-19.2481l17.507 4.691c-.1798.3443-.3693.6827-.5681 1.0149l-17.2257-4.6156 14.3874 8.3066c-.2723.2801-.5528.5522-.8411.8161l-14.1087-8.1457 10.6759 10.6758c-.3377.1973-.6817.385-1.0316.5628l-10.4426-10.4426 6.8421 11.8508c-.3746.1059-.7537.2012-1.1368.2855l-6.6825-11.5744 3.2219 12.0243c-.2872.0122-.5759.0184-.8661.0184-.0991 0-.198-.0007-.2967-.0022l-3.1483-11.7497v11.4569c-.3795-.0657-.7554-.1421-1.1273-.2289v-11.2261l-2.7759 10.36c-.3541-.1396-.7033-.289-1.0471-.4478l2.7337-10.2024-5.13174 8.8884c-.31771-.2034-.62929-.4156-.93441-.6361l5.09135-8.8186-7.1301 7.1302c-.2731-.2583-.53893-.5241-.79717-.7971l7.12787-7.1279-8.81599 5.0899c-.22059-.3051-.4328-.6167-.6363-.9344l8.89259-5.1341-10.20737 2.735c-.15888-.3438-.3083-.693-.44793-1.047l10.3599-2.776h-11.226124c-.086806-.3719-.163256-.7477-.22903-1.1273h11.452154l-11.74511583-3.1471c-.00145443-.0995-.00218417-.1991-.00218417-.2989 0-.2894.00613486-.5774.0182816-.8639l12.0258184 3.2224-11.57621-6.6836c.084291-.3832.179549-.7623.285427-1.1369l11.855683 6.8449-10.44698-10.447c.17774-.3499.36544-.6939.56273-1.0315l10.68025 10.6802-8.14896-14.1144c.26387-.2882.53605-.56863.81617-.84096l8.30809 14.38996-4.61634-17.22828c.33214-.1988.67064-.38826 1.01484-.56802z" fill="#fff"/></svg>`
  },
  {
    id: "foresight",
    name: "Foresight",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 31 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#444ce7"><path d="m-.00195312 17.8433 30.90545312-17.8433-.8189 12.6994-26.32058 15.1961z"/><path d="m3.76367 27.8951 21.73573-12.5492-.8189 12.6994-17.15086 9.902z" opacity=".5"/><path d="m7.52734 37.9477 12.56596-7.255-.8189 12.6994-7.9811 4.6079z" opacity=".25"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 31 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m-.00195312 17.8433 30.90545312-17.8433-.8189 12.6994-26.32058 15.1961z"/><path d="m3.76367 27.8951 21.73573-12.5492-.8189 12.6994-17.15086 9.902z" opacity=".5"/><path d="m7.52734 37.9477 12.56596-7.255-.8189 12.6994-7.9811 4.6079z" opacity=".25"/></g></svg>`
  },
  {
    id: "galileo",
    name: "Galileo",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m29.5411 6.41772c2.6913 5.27688 4.209 11.25228 4.209 17.58218s-1.5177 12.3054-4.2091 17.5823c6.2304-3.3881 10.4593-9.9914 10.4593-17.5823s-4.2289-14.19404-10.4592-17.58218z" fill="#6172f3"/><path d="m20.5481 5.99826c-.9047-1.28153-2.4457-1.9717-3.9913-1.70349-9.40496 1.63214-16.5568 9.83343-16.5568 19.70503 0 9.8717 7.1518 18.0729 16.5567 19.7051 1.5456.2682 3.0867-.4219 3.9913-1.7035 3.5923-5.0889 5.7025-11.2988 5.7025-18.0016 0-6.7027-2.1101-12.9126-5.7024-18.00154z" fill="#444ce7"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m29.5411 6.41772c2.6913 5.27688 4.209 11.25228 4.209 17.58218s-1.5177 12.3054-4.2091 17.5823c6.2304-3.3881 10.4593-9.9914 10.4593-17.5823s-4.2289-14.19404-10.4592-17.58218z" opacity=".7"/><path d="m20.5481 5.99826c-.9047-1.28153-2.4457-1.9717-3.9913-1.70349-9.40496 1.63214-16.5568 9.83343-16.5568 19.70503 0 9.8717 7.1518 18.0729 16.5567 19.7051 1.5456.2682 3.0867-.4219 3.9913-1.7035 3.5923-5.0889 5.7025-11.2988 5.7025-18.0016 0-6.7027-2.1101-12.9126-5.7024-18.00154z"/></g></svg>`
  },
  {
    id: "global-bank",
    name: "GlobalBank",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m27.6627 4h-15.3253l-12.3374 12.3373v15.3253l12.3374 12.3374h15.3253l12.3373-12.3374v-15.3253zm-13.2049 27.8554-7.90357-7.9036 7.90357-7.9036c2.988-2.988 7.9037-2.988 10.8916 0l7.9036 7.9036-7.9036 7.9036c-2.9879 2.988-7.8072 2.988-10.8916 0z" fill="#444ce7"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m27.6627 4h-15.3253l-12.3374 12.3373v15.3253l12.3374 12.3374h15.3253l12.3373-12.3374v-15.3253zm-13.2049 27.8554-7.90357-7.9036 7.90357-7.9036c2.988-2.988 7.9037-2.988 10.8916 0l7.9036 7.9036-7.9036 7.9036c-2.9879 2.988-7.8072 2.988-10.8916 0z" fill="#fff"/></svg>`
  },
  {
    id: "hexsmith",
    name: "Hexsmith",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m9.72461 41.7983h18.49589c1.2717 0 2.4469-.6785 3.0827-1.7798l4.1102-7.1191h-20.5481z" opacity=".7"/><path d="m25.1445 15.1015h-20.55661l4.11021-7.11909c.63585-1.10133 1.811-1.77977 3.0827-1.77977h18.4959z" opacity=".4"/><path d="m39.5272 25.7801c.6358-1.1014.6358-2.4582 0-3.5596l-4.1102-7.1191-5.1378 8.8989h-20.55068l5.13718 8.8989h20.5481l.0016-.0027.0016.0027z" opacity=".4"/><path d="m14.8634 32.8992-5.13775-8.8988-5.13776 8.8988 5.13776 8.8989z"/><path d="m25.1445 15.1014h-20.55593l-4.108166 7.1192c-.635516 1.1013-.635318 2.458.000521 3.5591l4.111125 7.1195 5.13775-8.8989h20.55l.0013-.0021z" opacity=".7"/><path d="m35.4181 15.1015-5.1378-8.89886-5.1377 8.89886 5.1377 8.8989z"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m9.72461 41.7983h18.49589c1.2717 0 2.4469-.6785 3.0827-1.7798l4.1102-7.1191h-20.5481z" opacity=".7"/><path d="m25.1445 15.1015h-20.55661l4.11021-7.11909c.63585-1.10133 1.811-1.77977 3.0827-1.77977h18.4959z" opacity=".4"/><path d="m39.5272 25.7801c.6358-1.1013.6358-2.4582 0-3.5596l-4.1102-7.1191-5.1378 8.8989h-20.55068l5.13718 8.8989h20.5481l.0016-.0027.0016.0027z" opacity=".4"/><path d="m14.8634 32.8992-5.13775-8.8988-5.13776 8.8988 5.13776 8.8989z"/><path d="m25.1445 15.1014h-20.55593l-4.108166 7.1192c-.635516 1.1013-.635318 2.458.000521 3.5591l4.111125 7.1195 5.13775-8.8989h20.55l.0013-.0022z" opacity=".7"/><path d="m35.4181 15.1015-5.1378-8.89886-5.1377 8.89886 5.1377 8.8989z"/></g></svg>`
  },
  {
    id: "hourglass",
    name: "Hourglass",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 30 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m0 41.2222c0 1.5341 1.24365 2.7778 2.77778 2.7778h24.44442c1.5341 0 2.7778-1.2437 2.7778-2.7778v-7.2222c0-8.2843-6.7157-15-15-15-8.28427 0-15 6.7157-15 15z" fill="#1570ef"/><path d="m0 6.77778c0-1.53413 1.24365-2.77778 2.77778-2.77778h24.44442c1.5341 0 2.7778 1.24365 2.7778 2.77778v7.22222c0 8.2843-6.7157 15-15 15-8.28427 0-15-6.7157-15-15z" fill="#53b1fd" opacity=".5"/></svg>`,
    darkSvg: `<svg width="100%" height="100%" viewBox="0 0 30 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path opacity="0.7" d="M0 41.2222C0 42.7563 1.24365 44 2.77778 44H27.2222C28.7563 44 30 42.7563 30 41.2222V34C30 25.7157 23.2843 19 15 19C6.71573 19 0 25.7157 0 34V41.2222Z" fill="white"/><path opacity="0.7" d="M0 6.77778C0 5.24365 1.24365 4 2.77778 4H27.2222C28.7563 4 30 5.24365 30 6.77778V14C30 22.2843 23.2843 29 15 29C6.71573 29 0 22.2843 0 14V6.77778Z" fill="white"/></svg>`
  },
  {
    id: "kintsugi",
    name: "Kintsugi",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m20 4 4.2861 9.6525 9.856-3.79464-3.7946 9.85604 9.6525 4.2861-9.6525 4.2861 3.7946 9.856-9.856-3.7946-4.2861 9.6525-4.2861-9.6525-9.85604 3.7946 3.79469-9.856-9.65255-4.2861 9.65255-4.2861-3.79469-9.85604 9.85604 3.79464z" fill="#155eef"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m20 4 4.2861 9.6525 9.856-3.79464-3.7946 9.85604 9.6525 4.2861-9.6525 4.2861 3.7946 9.856-9.856-3.7946-4.2861 9.6525-4.2861-9.6525-9.85604 3.7946 3.79469-9.856-9.65255-4.2861 9.65255-4.2861-3.79469-9.85604 9.85604 3.79464z" fill="#155eef"/></svg>`
  },
  {
    id: "layers",
    name: "Layers",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m5.03741 15.4637c.7506-2.8008 3.62961-5.67985 6.43049-6.43044l17.4617-4.67957c2.8009-.7506 4.4629.91146 3.7123 3.71231l-4.6795 17.4617c-.7506 2.8009-3.6297 5.6799-6.4305 6.4305l-17.46175 4.6796c-2.80085.7505-4.462904-.9115-3.712306-3.7124z" opacity=".7"/><path d="m12.0355 22.4642c.7506-2.8008 3.6296-5.6799 6.4304-6.4305l17.4617-4.6795c2.8009-.7506 4.4629.9114 3.7123 3.7123l-4.6795 17.4617c-.7506 2.8009-3.6296 5.6799-6.4305 6.4305l-17.4617 4.6795c-2.80085.7506-4.46291-.9114-3.71231-3.7123z" opacity=".7"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m5.03741 15.4637c.7506-2.8008 3.62961-5.67985 6.43049-6.43044l17.4617-4.67957c2.8009-.7506 4.4629.91146 3.7123 3.71231l-4.6795 17.4617c-.7506 2.8009-3.6297 5.6799-6.4305 6.4305l-17.46175 4.6795c-2.80085.7506-4.462904-.9114-3.712306-3.7123z" opacity=".7"/><path d="m12.0355 22.4642c.7506-2.8008 3.6296-5.6799 6.4304-6.4305l17.4617-4.6795c2.8009-.7506 4.4629.9114 3.7123 3.7123l-4.6795 17.4617c-.7506 2.8009-3.6296 5.6799-6.4305 6.4305l-17.4617 4.6795c-2.80085.7506-4.46291-.9114-3.71231-3.7123z" opacity=".7"/></g></svg>`
  },
  {
    id: "lightspeed",
    name: "Lightspeed",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 48 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m0 24c0 6.6274 5.37258 12 12 12v-12c0 6.6274 5.3726 12 12 12v-12c0 6.6274 5.3726 12 12 12s12-5.3726 12-12-5.3726-12-12-12-12 5.3726-12 12v-12c-6.6274 0-12 5.3726-12 12v-12c-6.62742 0-12 5.3726-12 12z" fill="#155eef"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 48 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m0 24c0 6.6274 5.37258 12 12 12v-12c0 6.6274 5.3726 12 12 12v-12c0 6.6274 5.3726 12 12 12s12-5.3726 12-12-5.3726-12-12-12-12 5.3726-12 12v-12c-6.6274 0-12 5.3726-12 12v-12c-6.62742 0-12 5.3726-12 12z" fill="#155eef"/></svg>`
  },
  {
    id: "luminescence",
    name: "Luminescence",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m32.3008 36h-.1015c-.0261.0402-.0523.0804-.0787.1204-2.7604 1.8201-6.0668 2.8794-9.6206 2.8794-9.665 0-17.5-7.835-17.5-17.5 0-3.5538 1.05931-6.8602 2.87939-9.6206.04009-.0264.08029-.0527.12061-.0788v-.1017c-.04056.0599-.08077.1201-.12061.1805-4.7469 3.1299-7.87939 8.5094-7.87939 14.6206 0 9.665 7.83502 17.5 17.5 17.5 6.1112 0 11.4907-3.1325 14.6206-7.8794.0603-.0398.1204-.0799.1802-.1204z"/><g opacity=".5"><path d="m40.0003 21.5c0 6.1112-3.1325 11.4907-7.8794 14.6206 1.8201-2.7604 2.8794-6.0668 2.8794-9.6206 0-9.665-7.835-17.5-17.5-17.5-3.5538 0-6.8602 1.0593-9.6206 2.8794 3.1299-4.74691 8.5094-7.8794 14.6206-7.8794 9.665 0 17.5 7.835 17.5 17.5z"/><path d="m32.0003 36.1994c.0403-.0261.0805-.0524.1206-.0788-.0398.0604-.08.1206-.1206.1805z"/><path d="m7.80088 12c.02611-.0403.05238-.0805.07882-.1206-.06043.0398-.12059.08-.18048.1206z"/></g></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m32.3008 36h-.1015c-.0261.0402-.0523.0804-.0787.1204-2.7604 1.8201-6.0668 2.8794-9.6206 2.8794-9.665 0-17.5-7.835-17.5-17.5 0-3.5538 1.05931-6.8602 2.87939-9.6206.04009-.0264.08029-.0527.12061-.0788v-.1017c-.04056.0599-.08077.1201-.12061.1805-4.7469 3.1299-7.87939 8.5094-7.87939 14.6206 0 9.665 7.83502 17.5 17.5 17.5 6.1112 0 11.4907-3.1325 14.6206-7.8794.0603-.0398.1204-.0799.1802-.1204z"/><g opacity=".5"><path d="m40.0003 21.5c0 6.1112-3.1325 11.4907-7.8794 14.6206 1.8201-2.7604 2.8794-6.0668 2.8794-9.6206 0-9.665-7.835-17.5-17.5-17.5-3.5538 0-6.8602 1.0593-9.6206 2.8794 3.1299-4.74691 8.5094-7.8794 14.6206-7.8794 9.665 0 17.5 7.835 17.5 17.5z"/><path d="m32.0003 36.1994c.0403-.0261.0805-.0524.1206-.0788-.0398.0604-.08.1206-.1206.1805z"/><path d="m7.80088 12c.02611-.0403.05238-.0805.07882-.1206-.06043.0398-.12059.08-.18048.1206z"/></g></g></svg>`
  },
  {
    id: "luminous",
    name: "Luminous",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 42 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m14.1061 19.6565c5.499-2.6299 9.8025-7.0929 12.2731-12.67168-1.5939-1.67362-3.666-2.86907-5.8975-3.58634l-1.1954-.39848c-.0797.15939-.1594.39849-.1594.55788-1.9127 5.41936-5.8178 9.80262-11.07766 12.27322-3.66599 1.7533-6.37564 4.9412-7.650763 8.7666l-.398477 1.1955c.159391.0797.39848.1593.557871.1593 1.514209.5579 3.028419 1.2752 4.462939 2.1519 1.99238-3.5864 5.18019-6.6148 9.08529-8.4479z"/><path d="m37.2173 19.9753c-2.9487 4.463-7.0132 8.0494-12.034 10.4403-4.0645 1.9127-7.1726 5.499-8.6071 9.8026l-.3985 1.3549c1.5142 1.3548 3.3472 2.3909 5.3396 3.0284l1.1955.3985c.0796-.1594.1593-.3985.1593-.5579 1.9127-5.4193 5.8178-9.8026 11.0777-12.2732 3.666-1.7533 6.4553-4.9412 7.6507-8.7666l.3985-1.1954c-1.6736-.4782-3.2675-1.2752-4.7817-2.2316z" opacity=".6"/><path d="m12.9903 37.4284c1.9924-4.7818 5.6584-8.6869 10.3604-10.9184 4.3035-2.0721 7.8898-5.26 10.3604-9.1651-1.833-1.7533-3.3472-3.7458-4.463-6.1366-2.9487 5.4193-7.571 9.8026-13.2294 12.5123-3.2675 1.5142-5.8974 4.1442-7.49136 7.3321 1.75326 1.6736 3.18786 3.7457 4.30356 6.0569 0 0 .0797.1594.1594.3188z" opacity=".8"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 42 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m14.1061 19.6565c5.499-2.6299 9.8025-7.0929 12.2731-12.67168-1.5939-1.67362-3.666-2.86907-5.8975-3.58634l-1.1954-.39848c-.0797.15939-.1594.39849-.1594.55788-1.9127 5.41936-5.8178 9.80262-11.07766 12.27322-3.66599 1.7533-6.37564 4.9412-7.650763 8.7666l-.398477 1.1955c.159391.0797.39848.1593.557871.1593 1.514209.5579 3.028419 1.2752 4.462939 2.1519 1.99238-3.5864 5.18019-6.6148 9.08529-8.4479z"/><path d="m37.2173 19.9753c-2.9487 4.463-7.0132 8.0494-12.034 10.4403-4.0645 1.9127-7.1726 5.499-8.6071 9.8026l-.3985 1.3549c1.5142 1.3548 3.3472 2.3909 5.3396 3.0284l1.1955.3985c.0796-.1594.1593-.3985.1593-.5579 1.9127-5.4193 5.8178-9.8026 11.0777-12.2732 3.666-1.7533 6.4553-4.9412 7.6507-8.7666l.3985-1.1954c-1.6736-.4782-3.2675-1.2752-4.7817-2.2316z" opacity=".5"/><path d="m12.9903 37.4284c1.9924-4.7818 5.6584-8.6869 10.3604-10.9184 4.3035-2.0721 7.8898-5.26 10.3604-9.1651-1.833-1.7533-3.3472-3.7458-4.463-6.1366-2.9487 5.4193-7.571 9.8026-13.2294 12.5123-3.2675 1.5142-5.8974 4.1442-7.49136 7.3321 1.75326 1.6736 3.18786 3.7457 4.30356 6.0569 0 0 .0797.1594.1594.3188z" opacity=".7"/></g></svg>`
  },
  {
    id: "pollinate",
    name: "Pollinate",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 38 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m25.0008 24c0 3.3137-2.6863 6-6 6s-6-2.6863-6-6 2.6863-6 6-6 6 2.6863 6 6z"/><path d="m25.0008 10c0 3.3137-2.6863 6-6 6s-6-2.6863-6-6c0-3.31371 2.6863-6 6-6s6 2.68629 6 6z"/><path d="m37.125 31c0 3.3137-2.6863 6-6 6s-6-2.6863-6-6 2.6863-6 6-6 6 2.6863 6 6z"/><path d="m37.127 17.0002c0 3.3137-2.6863 6-6 6-3.3138 0-6-2.6863-6-6s2.6862-6 6-6c3.3137 0 6 2.6863 6 6z"/><path d="m25.0008 38c0 3.3137-2.6863 6-6 6s-6-2.6863-6-6 2.6863-6 6-6 6 2.6863 6 6z"/><path d="m12.877 17c0 3.3137-2.6863 6-6.00005 6-3.31371 0-5.999997-2.6863-5.999997-6s2.686287-6 5.999997-6c3.31375 0 6.00005 2.6863 6.00005 6z"/><path d="m12.875 30.9997c0 3.3137-2.6863 6-6 6-3.31371 0-6-2.6863-6-6s2.68629-6 6-6c3.3137 0 6 2.6863 6 6z"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 38 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m25.0008 24c0 3.3137-2.6863 6-6 6s-6-2.6863-6-6 2.6863-6 6-6 6 2.6863 6 6z"/><path d="m25.0008 10c0 3.3137-2.6863 6-6 6s-6-2.6863-6-6c0-3.31371 2.6863-6 6-6s6 2.68629 6 6z"/><path d="m37.125 31c0 3.3137-2.6863 6-6 6s-6-2.6863-6-6 2.6863-6 6-6 6 2.6863 6 6z"/><path d="m37.127 17.0002c0 3.3137-2.6863 6-6 6-3.3138 0-6-2.6863-6-6s2.6862-6 6-6c3.3137 0 6 2.6863 6 6z"/><path d="m25.0008 38c0 3.3137-2.6863 6-6 6s-6-2.6863-6-6 2.6863-6 6-6 6 2.6863 6 6z"/><path d="m12.877 17c0 3.3137-2.6863 6-6.00005 6-3.31371 0-5.999997-2.6863-5.999997-6s2.686287-6 5.999997-6c3.31375 0 6.00005 2.6863 6.00005 6z"/><path d="m12.875 30.9997c0 3.3137-2.6863 6-6 6-3.31371 0-6-2.6863-6-6s2.68629-6 6-6c3.3137 0 6 2.6863 6 6z"/></g></svg>`
  },
  {
    id: "polymath",
    name: "Polymath",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 38 48" width="100%" xmlns="http://www.w3.org/2000/svg"><circle cx="19" cy="24" r="16" stroke="#155eef" stroke-width="6"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 38 48" width="100%" xmlns="http://www.w3.org/2000/svg"><circle cx="19" cy="24" r="16" stroke="#fff" stroke-width="6"/></svg>`
  },
  {
    id: "prometheus",
    name: "Prometheus",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 44 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m10.4993 16.5h-7.29875c-1.76731 0-3.20055 1.4327-3.20055 3.2v2.8h11c2.7614 0 5-2.2386 5-5s2.2386-5 5-5h19c2.2091 0 4-1.7909 4-4v-3h-22.5c-3.0376 0-5.5 2.46243-5.5 5.5 0 3.0376-2.4631 5.5-5.5007 5.5z"/><path d="m10.4993 26.5h-7.29875c-1.76731 0-3.20055 1.4327-3.20055 3.2v2.8h11c2.7614 0 5-2.2386 5-5s2.2386-5 5-5h13c2.2091 0 4-1.7909 4-4v-3h-16.5c-3.0376 0-5.5 2.4624-5.5 5.5s-2.4631 5.5-5.5007 5.5z" opacity=".7"/><path d="m10.4993 36.5h-7.29875c-1.76731 0-3.20055 1.4327-3.20055 3.2v2.8h11c2.7614 0 5-2.2386 5-5s2.2386-5 5-5h7.8c1.7673 0 3.2-1.4327 3.2-3.2v-3.8h-10.5c-3.0376 0-5.5 2.4624-5.5 5.5s-2.4631 5.5-5.5007 5.5z" opacity=".5"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 44 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m10.4993 16.5h-7.29875c-1.76731 0-3.20055 1.4327-3.20055 3.2v2.8h11c2.7614 0 5-2.2386 5-5s2.2386-5 5-5h19c2.2091 0 4-1.7909 4-4v-3h-22.5c-3.0376 0-5.5 2.46243-5.5 5.5 0 3.0376-2.4631 5.5-5.5007 5.5z"/><path d="m10.4993 26.5h-7.29875c-1.76731 0-3.20055 1.4327-3.20055 3.2v2.8h11c2.7614 0 5-2.2386 5-5s2.2386-5 5-5h13c2.2091 0 4-1.7909 4-4v-3h-16.5c-3.0376 0-5.5 2.4624-5.5 5.5s-2.4631 5.5-5.5007 5.5z" opacity=".75"/><path d="m10.4993 36.5h-7.29875c-1.76731 0-3.20055 1.4327-3.20055 3.2v2.8h11c2.7614 0 5-2.2386 5-5s2.2386-5 5-5h7.8c1.7673 0 3.2-1.4327 3.2-3.2v-3.8h-10.5c-3.0376 0-5.5 2.4624-5.5 5.5s-2.4631 5.5-5.5007 5.5z" opacity=".5"/></g></svg>`
  },
  {
    id: "quantum",
    name: "Quantum",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 39 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m9 23c0-5.5228 4.4772-10 10-10 5.5229 0 10 4.4772 10 10h9c0-10.4934-8.5066-19-19-19-10.49341 0-18.99999908 8.5066-19 19s8.50659 19 19 19v-9c-5.5228 0-10-4.4771-10-10z"/><path d="m29 23c0 5.5228 4.4772 10 10 10v9c-10.4934 0-19-8.5066-19-19z" opacity=".5"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 39 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m9 23c0-5.5228 4.4772-10 10-10 5.5229 0 10 4.4772 10 10h9c0-10.4934-8.5066-19-19-19-10.49341 0-18.99999908 8.5066-19 19s8.50659 19 19 19v-9c-5.5228 0-10-4.4771-10-10z"/><path d="m29 23c0 5.5228 4.4772 10 10 10v9c-10.4934 0-19-8.5066-19-19z" opacity=".5"/></g></svg>`
  },
  {
    id: "quartz-ai",
    name: "QuartzAI",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 44 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m17.6264 6.5h14.8017l11.4661 18.6661-15.7786 15.9489-22.68835-4.0459-5.157719-19.2098zm.5273 4.9692-6.816 15.105 6.4504 5.3411 8.8246-3.7975zm12.3276 15.3 9.2139-2.7073-7.1983-11.7184zm-.6163-17.2692h-9.3468l7.3309 14.4284zm6.9795 18.5263-6.779 1.9919-.5448 5.4109zm-10.5005 9.008.5824-5.7856-6.0573 2.6067zm-6.8394-.5022-10.91261-1.9459 1.64741-5.0264 6.438 5.3308zm-11.69782-9.1824-2.7037-3.0571 1.66868 6.215zm-3.53432-8.5248 4.81433 5.4437 5.50351-12.1963z" fill="#155eef" fill-rule="evenodd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 44 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m17.6264 6.5h14.8017l11.4661 18.6661-15.7786 15.9489-22.68835-4.0459-5.157719-19.2098zm.5273 4.9692-6.816 15.105 6.4504 5.3411 8.8246-3.7975zm12.3276 15.3 9.2139-2.7073-7.1983-11.7184zm-.6163-17.2692h-9.3468l7.3309 14.4284zm6.9795 18.5263-6.779 1.9919-.5448 5.4109zm-10.5005 9.008.5824-5.7856-6.0573 2.6067zm-6.8394-.5022-10.91261-1.9459 1.64741-5.0264 6.438 5.3308zm-11.69782-9.1824-2.7037-3.0571 1.66868 6.215zm-3.53432-8.5248 4.81433 5.4437 5.50351-12.1963z" fill="#fff" fill-rule="evenodd"/></svg>`
  },
  {
    id: "radius",
    name: "Radius",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g clip-rule="evenodd" fill="#155eef" fill-rule="evenodd"><path d="m18.5 19v-15h3v15z"/><path d="m18.5 44v-15h3v15z"/><path d="m22.4754 19.404 10.6066-10.60664 2.1214 2.12134-8.4853 8.4853z"/><path d="m4.79776 37.0816 10.60664-10.6066 2.1213 2.1214-10.60662 10.6066z"/><path d="m26.7178 28.5963 8.4853 8.4852-2.1213 2.1214-10.6066-10.6066z"/><path d="m6.91885 8.79727 10.60665 10.60663-2.1214 2.1213-10.60657-10.6066z"/><path d="m18.5 22.5h21.5v3h-21.5z"/><path d="m.00000026 22.5h14.99999974v3h-15z"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g clip-rule="evenodd" fill="#155eef" fill-rule="evenodd"><path d="m18.5 19v-15h3v15z"/><path d="m18.5 44v-15h3v15z"/><path d="m22.4754 19.404 10.6066-10.60664 2.1214 2.12134-8.4853 8.4853z"/><path d="m4.79776 37.0816 10.60664-10.6066 2.1213 2.1214-10.60662 10.6066z"/><path d="m26.7178 28.5963 8.4853 8.4852-2.1213 2.1214-10.6066-10.6066z"/><path d="m6.91885 8.79727 10.60665 10.60663-2.1214 2.1213-10.60657-10.6066z"/><path d="m18.5 22.5h21.5v3h-21.5z"/><path d="m.00000026 22.5h14.99999974v3h-15z"/></g></svg>`
  },
  {
    id: "railspeed",
    name: "Railspeed",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 36 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m0 7.5h28.8c2.5202 0 3.7804 0 4.743.49047.8467.43143 1.5351 1.11984 1.9665 1.96657.4905.96256.4905 2.22276.4905 4.74296v1.8h-28.8c-2.52024 0-3.78035 0-4.74296-.4905-.84673-.4314-1.535139-1.1198-1.966569-1.9665-.490471-.9626-.490471-2.2228-.490471-4.743z"/><path d="m0 28.5h28.8c2.5202 0 3.7804 0 4.743-.4905.8467-.4314 1.5351-1.1198 1.9665-1.9665.4905-.9626.4905-2.2228.4905-4.743v-1.8h-28.8c-2.52024 0-3.78035 0-4.74296.4905-.84673.4314-1.535139 1.1198-1.966569 1.9665-.490471.9626-.490471 2.2228-.490471 4.743z"/><path d="m14 31.5h14.8c2.5202 0 3.7804 0 4.743.4905.8467.4314 1.5351 1.1198 1.9665 1.9665.4905.9626.4905 2.2228.4905 4.743v1.8h-14.8c-2.5202 0-3.7804 0-4.743-.4905-.8467-.4314-1.5351-1.1198-1.9665-1.9665-.4905-.9626-.4905-2.2228-.4905-4.743z"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 36 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m0 7.5h28.8c2.5202 0 3.7804 0 4.743.49047.8467.43143 1.5351 1.11984 1.9665 1.96657.4905.96256.4905 2.22276.4905 4.74296v1.8h-28.8c-2.52024 0-3.78035 0-4.74296-.4905-.84673-.4314-1.535139-1.1198-1.966569-1.9665-.490471-.9626-.490471-2.2228-.490471-4.743z"/><path d="m0 28.5h28.8c2.5202 0 3.7804 0 4.743-.4905.8467-.4314 1.5351-1.1198 1.9665-1.9665.4905-.9626.4905-2.2228.4905-4.743v-1.8h-28.8c-2.52024 0-3.78035 0-4.74296.4905-.84673.4314-1.535139 1.1198-1.966569 1.9665-.490471.9626-.490471 2.2228-.490471 4.743z"/><path d="m14 31.5h14.8c2.5202 0 3.7804 0 4.743.4905.8467.4314 1.5351 1.1198 1.9665 1.9665.4905.9626.4905 2.2228.4905 4.743v1.8h-14.8c-2.5202 0-3.7804 0-4.743-.4905-.8467-.4314-1.5351-1.1198-1.9665-1.9665-.4905-.9626-.4905-2.2228-.4905-4.743z"/></g></svg>`
  },
  {
    id: "refractional",
    name: "Refractional",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 48 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m48 11h-17.0775c-1.2151 0-2.3644.5524-3.1235 1.5012l-1.598 1.9976c-.7591.9488-1.9084 1.5012-3.1235 1.5012h-15.0775l-4 5h17.0775c1.2151 0 2.3644-.5524 3.1235-1.5012l1.598-1.9976c.7591-.9488 1.9084-1.5012 3.1235-1.5012h15.0775z" fill="#444ce7"/><path d="m46 19h-17.0775c-1.2151 0-2.3644.5524-3.1235 1.5012l-1.598 1.9976c-.7591.9488-1.9084 1.5012-3.1235 1.5012h-15.0775l-4 5h17.0775c1.2151 0 2.3644-.5524 3.1235-1.5012l1.598-1.9976c.7591-.9488 1.9084-1.5012 3.1235-1.5012h15.0775z" fill="#155eef"/><path d="m44 27h-17.0775c-1.2151 0-2.3644.5524-3.1235 1.5012l-1.598 1.9976c-.7591.9488-1.9084 1.5012-3.1235 1.5012h-15.0775l-4 5h17.0775c1.2151 0 2.3644-.5524 3.1235-1.5012l1.598-1.9976c.7591-.9488 1.9084-1.5012 3.1235-1.5012h15.0775z" fill="#8098f9"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 48 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m48 11h-17.0775c-1.2151 0-2.3644.5524-3.1235 1.5012l-1.598 1.9976c-.7591.9488-1.9084 1.5012-3.1235 1.5012h-15.0775l-4 5h17.0775c1.2151 0 2.3644-.5524 3.1235-1.5012l1.598-1.9976c.7591-.9488 1.9084-1.5012 3.1235-1.5012h15.0775z"/><path d="m46 19h-17.0775c-1.2151 0-2.3644.5524-3.1235 1.5012l-1.598 1.9976c-.7591.9488-1.9084 1.5012-3.1235 1.5012h-15.0775l-4 5h17.0775c1.2151 0 2.3644-.5524 3.1235-1.5012l1.598-1.9976c.7591-.9488 1.9084-1.5012 3.1235-1.5012h15.0775z"/><path d="m44 27h-17.0775c-1.2151 0-2.3644.5524-3.1235 1.5012l-1.598 1.9976c-.7591.9488-1.9084 1.5012-3.1235 1.5012h-15.0775l-4 5h17.0775c1.2151 0 2.3644-.5524 3.1235-1.5012l1.598-1.9976c.7591-.9488 1.9084-1.5012 3.1235-1.5012h15.0775z"/></g></svg>`
  },
  {
    id: "renaissance",
    name: "Renaissance",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 35 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m12.7018 5c1.841 0 3.4172 1.31967 3.7408 3.13199l.4648 2.60271c.3236 1.8123 1.8998 3.132 3.7408 3.132h3.1518c4.8969 0 8.8667 3.9697 8.8667 8.8666 0 2.9333-1.4244 5.5339-3.6191 7.1479.92.3126 1.6466.809 2.1799 1.461.549.7191.9411 1.7411 1.1764 3.028.0392.3406.0883.6718.1373 1.003s.098.6624.1372 1.003c.0408.3538.0709.6566.096.9083.0232.233.042.4223.0609.5679.0784 1.0598.1961 1.9303.3529 2.5738.1655.9048.4994 1.7867.9727 2.5738h-6.6982c-.3137-.6056-.5098-1.3248-.6666-2.1196-.1349-.6836-.2408-1.5352-.3676-2.5548-.0207-.1659-.0418-.3362-.0638-.5111l-.2353-1.7411c-.1961-1.3247-.4314-2.271-.6667-2.8766-.2745-.5677-.7058-.9841-1.2941-1.2112-.6274-.2271-1.5686-.3856-2.9019-.3856h-.3018c-1.841 0-3.4172-1.3197-3.7408-3.132l-.4648-2.6027c-.3236-1.8123-1.8998-3.132-3.7408-3.132h-5.68517v10.1334h-6.33333v-27.8667zm13.6315 17.7333c0 1.3992-1.1342 2.5334-2.5333 2.5334h-3.1518c-1.841 0-3.4172-1.3197-3.7408-3.132l-.4648-2.6027c-.3236-1.8123-1.8998-3.132-3.7408-3.132h-5.36847v-5.0667h5.68517c1.841 0 3.4172 1.3197 3.7408 3.132l.4647 2.6027c.3237 1.8123 1.8999 3.132 3.7409 3.132h2.8351c1.3991 0 2.5333 1.1342 2.5333 2.5333z" fill="#1849a9" fill-rule="evenodd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 35 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m12.7018 5c1.841 0 3.4172 1.31967 3.7408 3.13199l.4648 2.60271c.3236 1.8123 1.8998 3.132 3.7408 3.132h3.1518c4.8969 0 8.8667 3.9697 8.8667 8.8666 0 2.9333-1.4244 5.5339-3.6191 7.1479.92.3126 1.6466.809 2.1799 1.461.549.7191.9411 1.7411 1.1764 3.028.0392.3406.0883.6718.1373 1.003s.098.6624.1372 1.003c.0408.3538.0709.6566.096.9083.0232.233.042.4223.0609.5679.0784 1.0598.1961 1.9303.3529 2.5738.1655.9048.4994 1.7867.9727 2.5738h-6.6982c-.3137-.6056-.5098-1.3247-.6666-2.1196-.1349-.6836-.2408-1.5352-.3676-2.5548-.0207-.1659-.0418-.3362-.0638-.5111l-.2353-1.7411c-.1961-1.3247-.4314-2.271-.6667-2.8766-.2745-.5677-.7058-.9841-1.2941-1.2112-.6274-.2271-1.5686-.3856-2.9019-.3856h-.3018c-1.841 0-3.4172-1.3197-3.7408-3.132l-.4648-2.6027c-.3236-1.8123-1.8998-3.132-3.7408-3.132h-5.68517v10.1334h-6.33333v-27.8667zm13.6315 17.7333c0 1.3992-1.1342 2.5334-2.5333 2.5334h-3.1518c-1.841 0-3.4172-1.3197-3.7408-3.132l-.4648-2.6027c-.3236-1.8123-1.8998-3.132-3.7408-3.132h-5.36847v-5.0667h5.68517c1.841 0 3.4172 1.3197 3.7408 3.132l.4647 2.6027c.3237 1.8123 1.8999 3.132 3.7409 3.132h2.8351c1.3991 0 2.5333 1.1342 2.5333 2.5333z" fill="#fff" fill-rule="evenodd"/></svg>`
  },
  {
    id: "sisyphus",
    name: "Sisyphus",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 32 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m.599609 19.2002h9.59998v9.59999h-9.59998z"/><path d="m31.4004 28.7998h9.6v9.59999h-9.6z" transform="matrix(-1 0 -0 -1 62.8008 57.5996)"/><path d="m10.1992 19.2001 11.6-9.6v9.6l-11.6 9.6z" opacity=".2"/><path d="m21.7988 28.7999-11.6 9.6v-9.6l11.6-9.6z" opacity=".5"/><path d="m.599609 19.2 21.199991-19.2v9.59999l-11.6 9.60001z" opacity=".6"/><path d="m31.4004 28.8-21.2 19.2v-9.6l11.6-9.6z" opacity=".7"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 32 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m.599609 19.2002h9.59998v9.59999h-9.59998z"/><path d="m31.4004 28.7998h9.6v9.59999h-9.6z" transform="matrix(-1 0 -0 -1 62.8008 57.5996)"/><path d="m10.1992 19.2001 11.6-9.6v9.6l-11.6 9.6z" opacity=".2"/><path d="m21.7988 28.7999-11.6 9.6v-9.6l11.6-9.6z" opacity=".5"/><path d="m.599609 19.2 21.199991-19.2v9.59999l-11.6 9.60001z" opacity=".6"/><path d="m31.4004 28.8-21.2 19.2v-9.6l11.6-9.6z" opacity=".7"/></g></svg>`
  },
  {
    id: "solaris-energy",
    name: "Solaris Energy",
    lightSvg: `<svg width="100%" height="100%" viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 4V16.3604C20 19.087 16.6569 20.3998 14.8016 18.4017L7 10M40 24H27.6396C24.913 24 23.6002 20.6569 25.5983 18.8016L34 11M20 44V31.6396C20 28.913 23.3431 27.6002 25.1984 29.5983L33 38M0 24L12.3604 24C15.087 24 16.3998 27.3431 14.4017 29.1984L6 37" stroke="#175CD3" stroke-width="4"/></svg>`,
    darkSvg: `<svg width="100%" height="100%" viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 4V16.3604C20 19.087 16.6569 20.3998 14.8016 18.4017L7 10M40 24H27.6396C24.913 24 23.6002 20.6569 25.5983 18.8016L34 11M20 44V31.6396C20 28.913 23.3431 27.6002 25.1984 29.5983L33 38M0 24L12.3604 24C15.087 24 16.3998 27.3431 14.4017 29.1984L6 37" stroke="white" stroke-width="4"/></svg>`
  }
];

// features/platform/store-settings/lib/store-logo.ts
var DEFAULT_STORE_LOGO_ICON = LOGO_ICONS.find((icon) => icon.id === "europa").lightSvg;
var DEFAULT_STORE_LOGO_COLOR = "120";
function normalizeStoreLogoColor(value) {
  const numeric = Number.parseFloat(String(value ?? DEFAULT_STORE_LOGO_COLOR));
  if (!Number.isFinite(numeric)) return DEFAULT_STORE_LOGO_COLOR;
  return String((numeric % 360 + 360) % 360);
}

// features/keystone/utils/storeLogo.ts
var ALLOWED_ELEMENTS = /* @__PURE__ */ new Set([
  "svg",
  "g",
  "path",
  "defs",
  "lineargradient",
  "radialgradient",
  "stop",
  "clippath",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "title",
  "desc"
]);
var ALLOWED_ATTRIBUTES = /* @__PURE__ */ new Set([
  "xmlns",
  "fill",
  "fill-rule",
  "clip-rule",
  "height",
  "width",
  "viewbox",
  "d",
  "clip-path",
  "id",
  "x1",
  "x2",
  "y1",
  "y2",
  "gradientunits",
  "gradienttransform",
  "offset",
  "stop-color",
  "stop-opacity",
  "opacity",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "transform",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "points",
  "role",
  "aria-hidden",
  "aria-label",
  "preserveaspectratio"
]);
var ATTRIBUTE_PATTERN = /\s+([A-Za-z_:][\w:.-]*)\s*=\s*("[^"]*"|'[^']*')/g;
var TAG_PATTERN = /<\/?\s*([A-Za-z][\w:-]*)([^<>]*)>/g;
function sanitizeStoreLogoSvg(svg) {
  const source = svg.trim();
  if (!source.startsWith("<svg") || !source.endsWith("</svg>") || source.length > 1e5) {
    return "";
  }
  if (/<!|<\?|\b(?:javascript|data|vbscript):|\bon[a-z]+\s*=|\b(?:href|src|style)\s*=/i.test(source)) {
    return "";
  }
  let tagCount = 0;
  let match;
  TAG_PATTERN.lastIndex = 0;
  while (match = TAG_PATTERN.exec(source)) {
    tagCount += 1;
    const element = match[1].toLowerCase();
    if (!ALLOWED_ELEMENTS.has(element)) return "";
    if (match[0].startsWith("</")) continue;
    const attributes = match[2];
    let consumed = "";
    ATTRIBUTE_PATTERN.lastIndex = 0;
    let attributeMatch;
    while (attributeMatch = ATTRIBUTE_PATTERN.exec(attributes)) {
      consumed += attributeMatch[0];
      const attribute = attributeMatch[1].toLowerCase();
      const value = attributeMatch[2].slice(1, -1);
      if (!ALLOWED_ATTRIBUTES.has(attribute)) return "";
      if (attribute === "id" && !/^[A-Za-z_][\w:.-]*$/.test(value)) return "";
      if (/url\(/i.test(value) && !/^url\(#[A-Za-z_][\w:.-]*\)$/.test(value)) return "";
    }
    const remainder = attributes.replace(consumed, "").replace(/\//g, "").trim();
    if (remainder) return "";
  }
  TAG_PATTERN.lastIndex = 0;
  if (tagCount === 0 || source.replace(TAG_PATTERN, "").trim()) return "";
  return source;
}

// features/keystone/models/storeLogoFields.ts
var storeLogoFields = {
  logoIcon: (0, import_fields13.text)({
    defaultValue: DEFAULT_STORE_LOGO_ICON,
    hooks: {
      resolveInput: ({ resolvedData, fieldKey }) => {
        const value = resolvedData[fieldKey];
        if (value === void 0 || value === null || value === "") return value;
        return typeof value === "string" ? sanitizeStoreLogoSvg(value) : "";
      },
      validate: ({ inputData, resolvedData, fieldKey, addValidationError }) => {
        const submitted = inputData?.[fieldKey];
        if (typeof submitted === "string" && submitted.trim() && !resolvedData?.[fieldKey]) {
          addValidationError("Logo must be a valid, safe SVG document");
        }
      }
    }
  }),
  logoColor: (0, import_fields13.text)({
    defaultValue: DEFAULT_STORE_LOGO_COLOR,
    hooks: {
      resolveInput: ({ resolvedData, fieldKey }) => {
        const value = resolvedData[fieldKey];
        return value === void 0 ? value : normalizeStoreLogoColor(value);
      }
    }
  })
};

// features/keystone/models/operations.ts
var import_fields14 = require("@keystone-6/core/fields");
var Channel = domainList("canManageChannels", { name: name(), commissionBps: (0, import_fields14.integer)({ defaultValue: 0, validation: { min: 0, max: 1e4 } }), paymentModel: state(["channel_collects", "we_collect"]), contact: (0, import_fields14.text)(), active: (0, import_fields14.checkbox)({ defaultValue: true }), allocation: (0, import_fields14.integer)({ defaultValue: 0, validation: { min: 0 } }), bookings: rel("Booking.channel", true), statements: rel("ChannelStatement.channel", true) });
var ChannelStatement = domainList("canManageChannels", { channel: rel("Channel.statements"), periodStart: (0, import_fields14.timestamp)(), periodEnd: (0, import_fields14.timestamp)(), bookings: rel("Booking.statement", true), grossCents: money(), commissionCents: money(), netDueCents: money(), currencyCode: currency(), status: state(["open", "invoiced", "paid"]), statementKey: (0, import_fields14.text)({ isIndexed: "unique" }) }, true);
var OperationalTask = domainList("canManageDepartures", { name: name(), departure: rel("Departure.tasks"), status: state(["open", "resolved"]), taskKey: (0, import_fields14.text)({ isIndexed: "unique" }), notes: (0, import_fields14.text)() }, true);
var WaitlistEntry = domainList("canManageBookings", {
  departure: rel("Departure.waitlist"),
  guestName: (0, import_fields14.text)({ validation: { isRequired: true } }),
  guestEmail: (0, import_fields14.text)({ isIndexed: true }),
  guestPhone: (0, import_fields14.text)(),
  seats: (0, import_fields14.integer)({ validation: { isRequired: true, min: 1 } }),
  tickets: (0, import_fields14.json)(),
  source: state(["online", "phone"]),
  status: state(["waiting", "offered", "converted", "expired", "withdrawn"]),
  offerHoldId: (0, import_fields14.text)({ isIndexed: true }),
  offeredAt: (0, import_fields14.timestamp)(),
  offerExpiresAt: (0, import_fields14.timestamp)(),
  bookingRef: (0, import_fields14.text)(),
  note: (0, import_fields14.text)()
}, true);
var NotificationPreference = domainList("canManageBookings", { email: (0, import_fields14.text)({ isIndexed: "unique" }), bookingUpdates: (0, import_fields14.checkbox)({ defaultValue: true }), weatherCancellation: (0, import_fields14.checkbox)({ defaultValue: true }) });
var settingsList = domainList("canManageSettings", { name: name(), timezone: (0, import_fields14.text)({ defaultValue: "America/New_York" }), address: (0, import_fields14.text)(), currencyCode: currency(), refundApprovalThresholdCents: (0, import_fields14.integer)({ defaultValue: 1e4, validation: { min: 0 } }), waitlistOfferHours: (0, import_fields14.integer)({ defaultValue: 12, validation: { min: 1, max: 168 } }), taxBps: (0, import_fields14.integer)({ defaultValue: 0, validation: { min: 0, max: 1e4 } }), settingsKey: (0, import_fields14.text)({ defaultValue: "operator", isIndexed: "unique" }), ...storeLogoFields });
var readsSettings = (args) => permissions.canManageSettings(args) || permissions.canIssueRefunds(args) || permissions.canManageBookings(args);
var StoreSettings = { ...settingsList, access: { ...settingsList.access, operation: { ...settingsList.access.operation, query: readsSettings } }, graphql: { plural: "StoreSettingsItems" } };
var AuditEvent = domainList("canReadAudit", { actor: rel("User.auditEvents"), action: (0, import_fields14.text)({ validation: { isRequired: true } }), targetList: (0, import_fields14.text)({ validation: { isRequired: true } }), targetId: (0, import_fields14.text)({ validation: { isRequired: true }, isIndexed: true }), before: (0, import_fields14.json)(), after: (0, import_fields14.json)(), reason: (0, import_fields14.text)(), requestId: (0, import_fields14.text)({ isIndexed: true }) }, true);
var PromoCode = domainList("canManagePromos", {
  code: (0, import_fields14.text)({ isIndexed: "unique", validation: { isRequired: true, match: { regex: /^[A-Z0-9_-]{3,40}$/, explanation: "Uppercase letters, digits, dash or underscore" } } }),
  discountType: state(["percent_bps", "amount_cents", "comp"]),
  value: (0, import_fields14.integer)({ defaultValue: 0, validation: { min: 0 } }),
  maxUses: (0, import_fields14.integer)({ validation: { min: 1 } }),
  usedCount: (0, import_fields14.integer)({ defaultValue: 0, access: { create: () => false, update: () => false } }),
  perOrderLimit: (0, import_fields14.integer)({ validation: { min: 1 } }),
  startsAt: (0, import_fields14.timestamp)(),
  endsAt: (0, import_fields14.timestamp)(),
  status: state(["active", "paused", "expired"]),
  tours: rel("Tour.promoCodes", true),
  redemptions: rel("PromoRedemption.promoCode", true)
});
var PromoRedemption = domainList("canManagePromos", {
  promoCode: rel("PromoCode.redemptions"),
  booking: rel("Booking.promoRedemptions"),
  holdId: (0, import_fields14.text)({ isIndexed: true }),
  amountCents: money(),
  currencyCode: currency(),
  status: state(["reserved", "committed", "released"])
}, true);

// features/keystone/models/PaymentProvider.ts
var import_core9 = require("@keystone-6/core");
var import_fields15 = require("@keystone-6/core/fields");
var canConfigureProvider = (args) => isSignedIn(args) && permissions.canManagePayments(args);
var PaymentProvider = (0, import_core9.list)({
  access: {
    operation: {
      query: ({ session }) => permissions.canReadPayments({ session }) || permissions.canManagePayments({ session }),
      create: canConfigureProvider,
      update: canConfigureProvider,
      delete: canConfigureProvider
    }
  },
  ui: {
    listView: {
      initialColumns: ["name", "code", "isInstalled"]
    }
  },
  fields: {
    name: (0, import_fields15.text)({
      validation: { isRequired: true }
    }),
    code: (0, import_fields15.text)({
      isIndexed: "unique",
      validation: {
        isRequired: true,
        match: {
          regex: /^pp_[a-zA-Z0-9-_]+$/,
          explanation: 'Payment provider code must start with "pp_" followed by alphanumeric characters, hyphens or underscores'
        }
      }
    }),
    isInstalled: (0, import_fields15.checkbox)({
      defaultValue: true
    }),
    credentials: (0, import_fields15.json)({
      access: { read: () => false, create: canConfigureProvider, update: canConfigureProvider },
      defaultValue: {}
    }),
    metadata: (0, import_fields15.json)({
      defaultValue: {}
    }),
    createPaymentFunction: (0, import_fields15.text)({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to create payments"
      }
    }),
    capturePaymentFunction: (0, import_fields15.text)({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to capture payments"
      }
    }),
    refundPaymentFunction: (0, import_fields15.text)({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to refund payments"
      }
    }),
    getPaymentStatusFunction: (0, import_fields15.text)({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to check payment status"
      }
    }),
    generatePaymentLinkFunction: (0, import_fields15.text)({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to generate payment dashboard links"
      }
    }),
    handleWebhookFunction: (0, import_fields15.text)({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to handle provider webhooks"
      }
    }),
    sessions: (0, import_fields15.relationship)({
      ref: "PaymentSession.paymentProvider",
      many: true
    }),
    ...trackingFields
  }
});

// features/keystone/models/PaymentCollection.ts
var import_core10 = require("@keystone-6/core");
var import_fields16 = require("@keystone-6/core/fields");
var PaymentCollection = (0, import_core10.list)({
  access: {
    operation: {
      query: ({ session }) => permissions.canManageBookings({ session }),
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  fields: {
    description: (0, import_fields16.select)({
      type: "enum",
      options: [
        { label: "Default", value: "default" },
        { label: "Refund", value: "refund" }
      ],
      defaultValue: "default"
    }),
    amount: (0, import_fields16.integer)({
      validation: { isRequired: true }
    }),
    authorizedAmount: (0, import_fields16.integer)({
      defaultValue: 0
    }),
    refundedAmount: (0, import_fields16.integer)({
      defaultValue: 0
    }),
    metadata: (0, import_fields16.json)(),
    paymentSessions: (0, import_fields16.relationship)({
      ref: "PaymentSession.paymentCollection",
      many: true
    }),
    payments: (0, import_fields16.relationship)({
      ref: "Payment.paymentCollection",
      many: true
    }),
    booking: (0, import_fields16.relationship)({ ref: "Booking.paymentCollection" }),
    ...trackingFields
  }
});

// features/keystone/models/PaymentSession.ts
var import_core11 = require("@keystone-6/core");
var import_fields17 = require("@keystone-6/core/fields");
var PaymentSession = (0, import_core11.list)({
  access: {
    operation: {
      query: ({ session }) => permissions.canManageBookings({ session }),
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  fields: {
    isSelected: (0, import_fields17.checkbox)({
      defaultValue: false
    }),
    isInitiated: (0, import_fields17.checkbox)({
      defaultValue: false
    }),
    amount: (0, import_fields17.integer)({
      validation: { isRequired: true }
    }),
    data: (0, import_fields17.json)({
      defaultValue: {}
    }),
    idempotencyKey: (0, import_fields17.text)({
      validation: { isRequired: true },
      isIndexed: "unique"
    }),
    paymentCollection: (0, import_fields17.relationship)({
      ref: "PaymentCollection.paymentSessions"
    }),
    paymentProvider: (0, import_fields17.relationship)({
      ref: "PaymentProvider.sessions",
      many: false
    }),
    paymentAuthorizedAt: (0, import_fields17.timestamp)(),
    ...trackingFields
  }
});

// features/keystone/models/Payment.ts
var import_core12 = require("@keystone-6/core");
var import_fields18 = require("@keystone-6/core/fields");
var Payment = (0, import_core12.list)({
  access: {
    operation: {
      query: ({ session }) => permissions.canReadPayments({ session }) || permissions.canManagePayments({ session }),
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    listView: {
      initialColumns: ["amount", "status", "paymentMethod", "order", "createdAt"]
    }
  },
  fields: {
    idempotencyKey: (0, import_fields18.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    reservedAt: (0, import_fields18.timestamp)(),
    refundedAmount: (0, import_fields18.integer)({ defaultValue: 0, validation: { min: 0 } }),
    amount: (0, import_fields18.integer)({
      validation: { isRequired: true },
      ui: {
        description: "Payment amount in cents"
      }
    }),
    data: (0, import_fields18.json)({
      ui: {
        description: "Payment provider data (clientSecret, paymentIntentId, orderId, etc.)"
      }
    }),
    currencyCode: (0, import_fields18.text)({
      defaultValue: "USD",
      ui: { description: "ISO 4217 currency code for this payment" },
      hooks: {
        resolveInput: async ({ operation, inputData, context }) => {
          if (operation === "create" && !inputData.currencyCode) {
            const settings = await context.sudo().query.StoreSettings.findOne({
              where: { id: "1" },
              query: "currencyCode"
            });
            return settings?.currencyCode || "USD";
          }
          return inputData.currencyCode;
        }
      }
    }),
    status: (0, import_fields18.select)({
      type: "string",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Processing", value: "processing" },
        { label: "Authorized", value: "authorized" },
        { label: "Unknown", value: "unknown" },
        { label: "Succeeded", value: "succeeded" },
        { label: "Failed", value: "failed" },
        { label: "Cancelled", value: "cancelled" },
        { label: "Refunded", value: "refunded" },
        { label: "Partially Refunded", value: "partially_refunded" }
      ],
      defaultValue: "pending",
      validation: { isRequired: true }
    }),
    paymentMethod: (0, import_fields18.select)({
      type: "string",
      options: [
        { label: "Credit Card", value: "credit_card" },
        { label: "Debit Card", value: "debit_card" },
        { label: "Cash", value: "cash" },
        { label: "Gift Card", value: "gift_card" },
        { label: "PayPal", value: "paypal" },
        { label: "Apple Pay", value: "apple_pay" },
        { label: "Google Pay", value: "google_pay" }
      ],
      defaultValue: "credit_card"
    }),
    paymentProvider: (0, import_fields18.relationship)({
      ref: "PaymentProvider",
      ui: {
        displayMode: "select",
        description: "Optional provider backing this payment"
      }
    }),
    providerPaymentId: (0, import_fields18.text)({
      ui: {
        description: "Provider payment identifier (Stripe/PayPal/etc.)"
      }
    }),
    // Card details (last 4 digits for reference)
    cardLast4: (0, import_fields18.text)({
      ui: {
        description: "Last 4 digits of card"
      }
    }),
    cardBrand: (0, import_fields18.text)({
      ui: {
        description: "Card brand (visa, mastercard, etc.)"
      }
    }),
    // Tip handling
    tipAmount: (0, import_fields18.integer)({
      defaultValue: 0,
      ui: {
        description: "Tip amount included in payment in cents"
      }
    }),
    // Split payment support
    isSplitPayment: (0, import_fields18.checkbox)({
      defaultValue: false,
      ui: {
        description: "Whether this payment is part of a split bill"
      }
    }),
    splitPaymentIndex: (0, import_fields18.integer)({
      ui: {
        description: "Index of this payment in split (1, 2, 3, etc.)"
      }
    }),
    splitTotal: (0, import_fields18.integer)({
      ui: {
        description: "Total number of split payments for this order"
      }
    }),
    processedAt: (0, import_fields18.timestamp)({
      ui: {
        description: "When payment was successfully processed"
      }
    }),
    // Metadata for errors or additional info
    errorMessage: (0, import_fields18.text)({
      ui: {
        description: "Error message if payment failed"
      }
    }),
    notes: (0, import_fields18.text)({
      ui: {
        displayMode: "textarea",
        description: "Internal notes about this payment"
      }
    }),
    // Relationships
    order: (0, import_fields18.relationship)({
      ref: "Booking.payments",
      ui: {
        displayMode: "select"
      }
    }),
    paymentCollection: (0, import_fields18.relationship)({
      ref: "PaymentCollection.payments",
      ui: {
        displayMode: "select",
        description: "Payment collection this payment belongs to"
      }
    }),
    processedBy: (0, import_fields18.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        description: "Staff member who processed payment"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Refund.ts
var import_core13 = require("@keystone-6/core");
var import_fields19 = require("@keystone-6/core/fields");
var Refund = (0, import_core13.list)({
  access: {
    operation: {
      query: ({ session }) => permissions.canReadPayments({ session }) || permissions.canManagePayments({ session }),
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  fields: {
    idempotencyKey: (0, import_fields19.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    amount: (0, import_fields19.integer)({ validation: { isRequired: true, min: 1 } }),
    currencyCode: (0, import_fields19.text)({ validation: { isRequired: true } }),
    status: (0, import_fields19.select)({
      type: "string",
      options: [
        { label: "Processing", value: "processing" },
        { label: "Succeeded", value: "succeeded" },
        { label: "Failed", value: "failed" },
        { label: "Unknown", value: "unknown" }
      ],
      defaultValue: "processing",
      validation: { isRequired: true }
    }),
    reason: (0, import_fields19.text)({ validation: { isRequired: true }, ui: { displayMode: "textarea" } }),
    providerRefundId: (0, import_fields19.text)(),
    providerData: (0, import_fields19.json)(),
    processedAt: (0, import_fields19.timestamp)(),
    payment: (0, import_fields19.relationship)({ ref: "Payment" }),
    order: (0, import_fields19.relationship)({ ref: "Booking.refunds" }),
    requestedBy: (0, import_fields19.relationship)({ ref: "User" }),
    approvedBy: (0, import_fields19.relationship)({ ref: "User" }),
    ...trackingFields
  }
});

// features/keystone/models/PaymentWebhookEvent.ts
var import_core14 = require("@keystone-6/core");
var import_fields20 = require("@keystone-6/core/fields");
var PaymentWebhookEvent = (0, import_core14.list)({
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  fields: {
    eventKey: (0, import_fields20.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    providerCode: (0, import_fields20.text)({ validation: { isRequired: true }, isIndexed: true }),
    providerEventId: (0, import_fields20.text)({ isIndexed: true }),
    eventType: (0, import_fields20.text)({ isIndexed: true }),
    status: (0, import_fields20.select)({
      type: "string",
      options: [
        { label: "Received", value: "received" },
        { label: "Processed", value: "processed" },
        { label: "Ignored", value: "ignored" },
        { label: "Failed", value: "failed" }
      ],
      defaultValue: "received"
    }),
    payload: (0, import_fields20.json)(),
    rawBody: (0, import_fields20.text)({ ui: { displayMode: "textarea" } }),
    error: (0, import_fields20.text)({ ui: { displayMode: "textarea" } }),
    attempts: (0, import_fields20.integer)({ defaultValue: 0 }),
    receivedAt: (0, import_fields20.timestamp)({ defaultValue: { kind: "now" }, isIndexed: true }),
    processedAt: (0, import_fields20.timestamp)(),
    payment: (0, import_fields20.relationship)({ ref: "Payment" }),
    ...trackingFields
  }
});

// features/keystone/models/ManagerApproval.ts
var import_core15 = require("@keystone-6/core");
var import_fields21 = require("@keystone-6/core/fields");
var ManagerApproval = (0, import_core15.list)({
  access: {
    operation: {
      query: ({ session }) => permissions.canIssueRefunds({ session }),
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  fields: {
    actionType: (0, import_fields21.select)({
      type: "string",
      options: [
        { label: "Refund booking", value: "refund_booking" }
      ],
      validation: { isRequired: true },
      isIndexed: true
    }),
    targetId: (0, import_fields21.text)({ validation: { isRequired: true }, isIndexed: true }),
    reason: (0, import_fields21.text)({ validation: { isRequired: true }, ui: { displayMode: "textarea" } }),
    amount: (0, import_fields21.integer)(),
    requestFingerprint: (0, import_fields21.text)({ validation: { isRequired: true } }),
    requestPayload: (0, import_fields21.json)(),
    status: (0, import_fields21.select)({
      type: "string",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Approved", value: "approved" },
        { label: "Rejected", value: "rejected" },
        { label: "Consumed", value: "consumed" },
        { label: "Expired", value: "expired" }
      ],
      defaultValue: "pending",
      validation: { isRequired: true },
      isIndexed: true
    }),
    requestedAt: (0, import_fields21.timestamp)({ defaultValue: { kind: "now" }, isIndexed: true }),
    approvedAt: (0, import_fields21.timestamp)(),
    consumedAt: (0, import_fields21.timestamp)(),
    expiresAt: (0, import_fields21.timestamp)({ validation: { isRequired: true }, isIndexed: true }),
    consumedEntityType: (0, import_fields21.text)(),
    consumedEntityId: (0, import_fields21.text)(),
    requestedBy: (0, import_fields21.relationship)({ ref: "User" }),
    approvedBy: (0, import_fields21.relationship)({ ref: "User" }),
    ...trackingFields
  },
  ui: { isHidden: true }
});

// features/keystone/models/IdempotencyKey.ts
var import_core16 = require("@keystone-6/core");
var import_fields22 = require("@keystone-6/core/fields");
var IdempotencyKey = (0, import_core16.list)({
  access: {
    operation: {
      query: () => false,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: (0, import_fields22.text)({
      isIndexed: "unique",
      validation: { isRequired: true }
    }),
    requestMethod: (0, import_fields22.text)({ validation: { isRequired: true } }),
    requestParams: (0, import_fields22.json)(),
    requestPath: (0, import_fields22.text)({ validation: { isRequired: true } }),
    responseCode: (0, import_fields22.integer)(),
    responseBody: (0, import_fields22.json)(),
    recoveryPoint: (0, import_fields22.text)({
      defaultValue: "started",
      validation: { isRequired: true }
    }),
    lockedAt: (0, import_fields22.timestamp)(),
    ...trackingFields
  }
});

// features/keystone/models/giftCards.ts
var import_fields23 = require("@keystone-6/core/fields");
var GiftCard = domainList("canManagePayments", {
  codeHash: (0, import_fields23.text)({ isIndexed: "unique", access: { read: () => false } }),
  last4: (0, import_fields23.text)(),
  status: state(["active", "void"]),
  initialCents: money(),
  balanceCents: money(),
  currencyCode: currency(),
  expiresAt: (0, import_fields23.timestamp)(),
  fundedBy: state(["cash", "complimentary"]),
  recipientName: (0, import_fields23.text)(),
  recipientEmail: (0, import_fields23.text)({ isIndexed: true }),
  note: (0, import_fields23.text)(),
  issuedById: (0, import_fields23.text)(),
  replacesId: (0, import_fields23.text)(),
  entries: rel("GiftCardEntry.giftCard", true)
}, true);
var GiftCardEntry = domainList("canManagePayments", {
  giftCard: rel("GiftCard.entries"),
  kind: state(["issue", "redeem", "return", "void"]),
  amountCents: (0, import_fields23.integer)({ validation: { isRequired: true } }),
  balanceAfterCents: money(),
  bookingId: (0, import_fields23.text)({ isIndexed: true }),
  bookingRef: (0, import_fields23.text)(),
  paymentId: (0, import_fields23.text)(),
  idempotencyKey: (0, import_fields23.text)({ isIndexed: "unique" }),
  reason: (0, import_fields23.text)(),
  actorId: (0, import_fields23.text)()
}, true);

// features/keystone/models/index.ts
var rawModels = {
  User,
  Role,
  OAuthApp,
  OAuthToken,
  Tour,
  TicketType,
  AddOn,
  MeetingPoint,
  CancellationPolicy,
  PricingRule,
  Schedule,
  Departure,
  Guide,
  GuideCertification,
  GuideAvailability,
  GuideAssignment,
  Resource,
  ResourceAssignment,
  GuidePayout,
  Booking,
  BookingLine,
  InventoryHold,
  PartyChange,
  Participant,
  WaiverTemplate,
  WaiverSignature,
  Channel,
  ChannelStatement,
  OperationalTask,
  NotificationPreference,
  WaitlistEntry,
  StoreSettings,
  AuditEvent,
  PromoCode,
  PromoRedemption,
  PaymentProvider,
  PaymentCollection,
  PaymentSession,
  Payment,
  Refund,
  PaymentWebhookEvent,
  IdempotencyKey,
  ManagerApproval,
  GiftCard,
  GiftCardEntry
};
var models = Object.fromEntries(Object.entries(rawModels).map(([key, config2]) => {
  const query = config2?.access?.operation?.query;
  if (typeof query !== "function") return [key, config2];
  const existing = config2?.ui?.isHidden;
  const isHidden = (args) => {
    if (existing === true) return true;
    if (typeof existing === "function" && existing(args)) return true;
    return !query(args);
  };
  return [key, { ...config2, ui: { ...config2.ui ?? {}, isHidden } }];
}));

// features/keystone/index.ts
var import_session = require("@keystone-6/core/session");

// features/keystone/mutations/index.ts
var import_schema = require("@graphql-tools/schema");

// features/keystone/mutations/redirectToInit.ts
async function redirectToInit(root, args, context) {
  const userCount = await context.sudo().query.User.count({});
  if (userCount === 0) {
    return true;
  }
  return false;
}
var redirectToInit_default = redirectToInit;

// features/keystone/mutations/storeLogo.ts
var storeLogoTypeDefs = `
  type StoreLogo { logoIcon: String! logoColor: String! }
  extend type Query { storeLogo: StoreLogo! }
`;
async function storeLogo(_root, _args, context) {
  const row = await context.prisma.storeSettings.findFirst({ select: { logoIcon: true, logoColor: true } });
  return { logoIcon: row?.logoIcon || DEFAULT_STORE_LOGO_ICON, logoColor: row?.logoColor || DEFAULT_STORE_LOGO_COLOR };
}

// features/keystone/lib/tour-command.ts
var import_node_crypto3 = require("node:crypto");
var import_graphql2 = require("graphql");

// features/keystone/utils/idempotency.ts
var import_node_crypto2 = __toESM(require("node:crypto"));
function normalize(value) {
  if (value === null || value === void 0) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Idempotency request contains a non-finite number");
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).filter(([, entry]) => entry !== void 0).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, normalize(entry)])
    );
  }
  throw new Error(`Unsupported idempotency request value: ${typeof value}`);
}
function canonicalIdempotencyParams(params) {
  return normalize(params);
}
function idempotencyFingerprint(params) {
  return import_node_crypto2.default.createHash("sha256").update(JSON.stringify(canonicalIdempotencyParams(params))).digest("hex");
}
function storedFingerprint(requestParams) {
  const params = requestParams && typeof requestParams === "object" ? { ...requestParams } : {};
  const recorded = typeof params._fingerprint === "string" ? params._fingerprint : null;
  delete params._fingerprint;
  const calculated = idempotencyFingerprint(params);
  if (recorded && recorded !== calculated) {
    throw new Error("Stored idempotency request fingerprint is invalid");
  }
  return calculated;
}
function assertIdempotencyRequest(attempt, request) {
  const method = request.requestMethod || "POST";
  const expectedFingerprint = idempotencyFingerprint(request.requestParams);
  if (attempt.requestMethod !== method || attempt.requestPath !== request.requestPath || storedFingerprint(attempt.requestParams) !== expectedFingerprint) {
    throw new Error("Idempotency key was already used with a different request");
  }
}
async function updateIdempotencyAttempt(prisma, attemptId, recoveryPoint, responseBody, responseCode) {
  await prisma.idempotencyKey.update({
    where: { id: attemptId },
    data: {
      recoveryPoint,
      responseBody,
      responseCode,
      lockedAt: ["completed", "failed"].includes(recoveryPoint) ? null : /* @__PURE__ */ new Date()
    }
  });
}

// features/keystone/lib/tour-command.ts
var import_client = require("@prisma/client");

// features/keystone/lib/constraint-errors.ts
var import_graphql = require("graphql");
var AMOUNT = "TOUR_INVALID_AMOUNT";
var CURRENCY = { code: "TOUR_INVALID_CURRENCY", message: "Currency must be a three-letter code, such as USD." };
var TIME = "TOUR_INVALID_TIME_RANGE";
var CONSTRAINT_MESSAGES = {
  Booking_amounts_valid: { code: AMOUNT, message: "Booking amounts and seats can\u2019t be negative." },
  Booking_refunded_within_total: { code: "TOUR_REFUND_EXCEEDS_TOTAL", message: "A booking can\u2019t be refunded more than its total." },
  BookingLine_amounts_valid: { code: AMOUNT, message: "Booking line amounts and seats can\u2019t be negative." },
  AddOn_price_valid: { code: AMOUNT, message: "An add-on price can\u2019t be negative." },
  TicketType_valid: { code: AMOUNT, message: "A ticket needs a price of zero or more, and its minimum age can\u2019t be above its maximum age." },
  Channel_rate_valid: { code: "TOUR_INVALID_RATE", message: "A channel commission must be between 0% and 100%." },
  ChannelStatement_amounts_valid: { code: AMOUNT, message: "A statement\u2019s commission can\u2019t be negative or more than its gross sales." },
  ChannelStatement_period_order: { code: TIME, message: "A statement period must end on or after it starts." },
  Departure_valid: { code: "TOUR_INVALID_DEPARTURE", message: "A departure needs a capacity of zero or more, must end after it starts, and can\u2019t have a negative booking cutoff." },
  Tour_valid: { code: AMOUNT, message: "Durations, participant limits and minimum age can\u2019t be negative." },
  Tour_participants_order: { code: AMOUNT, message: "The minimum group size can\u2019t be larger than the maximum." },
  GiftCard_valid: { code: "TOUR_INVALID_GIFT_CARD", message: "A gift card balance can\u2019t be negative or more than its original value." },
  GiftCardEntry_valid: { code: "TOUR_INVALID_GIFT_CARD", message: "A gift card entry can\u2019t be zero, and the balance after it can\u2019t be negative." },
  Guide_rate_valid: { code: AMOUNT, message: "A guide\u2019s pay rate can\u2019t be negative." },
  GuideAssignment_pay_valid: { code: AMOUNT, message: "Guide pay can\u2019t be negative." },
  GuideAvailability_order: { code: TIME, message: "An availability window must end after it starts." },
  GuidePayout_valid: { code: AMOUNT, message: "A payout can\u2019t be negative and its period must end on or after it starts." },
  InventoryHold_quantity_positive: { code: AMOUNT, message: "A hold needs at least one seat." },
  ManagerApproval_amount_valid: { code: AMOUNT, message: "An approval amount can\u2019t be negative." },
  ManagerApproval_time_order: { code: TIME, message: "An approval can\u2019t expire before it is requested." },
  PartyChange_amounts_valid: { code: AMOUNT, message: "Party change amounts can\u2019t be negative." },
  Payment_amounts_valid: { code: AMOUNT, message: "A payment must be positive, and refunds can\u2019t exceed it." },
  Refund_amount_positive: { code: AMOUNT, message: "A refund must be a positive amount." },
  Refund_within_payment: { code: "TOUR_REFUND_EXCEEDS_PAYMENT", message: "Refunds can\u2019t exceed what was paid, and must be in the payment\u2019s currency." },
  PaymentCollection_amounts_valid: { code: AMOUNT, message: "Payment collection amounts can\u2019t be negative." },
  PaymentSession_amount_valid: { code: AMOUNT, message: "A payment amount can\u2019t be negative." },
  PricingRule_price_valid: { code: AMOUNT, message: "A price override can\u2019t be negative." },
  PromoCode_valid: { code: "TOUR_INVALID_PROMO", message: "A promo needs a value of zero or more, at least one use per order, and an end date on or after its start." },
  PromoCode_used_within_max: { code: "TOUR_PROMO_EXHAUSTED", message: "That promo code has no uses left." },
  PromoRedemption_amount_valid: { code: AMOUNT, message: "A promo discount can\u2019t be negative." },
  Resource_valid: { code: AMOUNT, message: "A resource needs zero or more seats and at least one unit." },
  ResourceAssignment_quantity_valid: { code: AMOUNT, message: "An assignment needs at least one unit." },
  Schedule_capacity_valid: { code: AMOUNT, message: "A capacity override can\u2019t be negative." },
  StoreSettings_valid: { code: "TOUR_INVALID_RATE", message: "The refund threshold and waitlist hours can\u2019t be negative, and tax must be between 0% and 100%." },
  WaitlistEntry_seats_valid: { code: AMOUNT, message: "A waitlist entry needs at least one seat." },
  Departure_within_capacity: { code: "TOUR_DEPARTURE_FULL", message: "That departure no longer has enough seats. Reload and try again." },
  AddOn_currency_code: CURRENCY,
  Booking_currency_code: CURRENCY,
  BookingLine_currency_code: CURRENCY,
  ChannelStatement_currency_code: CURRENCY,
  GiftCard_currency_code: CURRENCY,
  Guide_currency_code: CURRENCY,
  GuideAssignment_currency_code: CURRENCY,
  GuidePayout_currency_code: CURRENCY,
  PartyChange_currency_code: CURRENCY,
  Payment_currency_code: CURRENCY,
  PricingRule_currency_code: CURRENCY,
  PromoRedemption_currency_code: CURRENCY,
  Refund_currency_code: CURRENCY,
  StoreSettings_currency_code: CURRENCY,
  TicketType_currency_code: CURRENCY,
  PromoRedemption_promo_booking_key: { code: "TOUR_DUPLICATE_PROMO", message: "That promo is already applied to this booking.", fields: ["booking", "promoCode"] },
  GuideAssignment_departure_guide_key: { code: "TOUR_DUPLICATE_ASSIGNMENT", message: "That guide is already assigned to this departure.", fields: ["departure", "guide"] }
};
function chain(error) {
  const out = [];
  let current = error;
  for (let depth = 0; current && depth < 6; depth++) {
    out.push(current);
    current = current.originalError ?? current.cause;
  }
  return out;
}
function constraintRefusal(error) {
  for (const link of chain(error)) {
    const text22 = [
      link?.message,
      typeof link?.meta === "object" ? JSON.stringify(link.meta) : "",
      link?.extensions?.debug?.message ?? "",
      link?.extensions?.prisma?.meta ? JSON.stringify(link.extensions.prisma.meta) : ""
    ].join(" ");
    for (const [name3, rule] of Object.entries(CONSTRAINT_MESSAGES)) if (text22.includes(name3)) return rule;
    const listed = /Unique constraint failed on the fields: \((.*?)\)(?:\s|$)/.exec(String(link?.message || ""))?.[1]?.match(/`([^`]+)`/g)?.map((field) => field.slice(1, -1));
    const keyed = /Key \((.*?)\)=\(.*\) already exists/.exec(text22)?.[1]?.split(",").map((field) => field.trim().replace(/^"|"$/g, ""));
    const unwrap = (field) => String(field).replace(/^lower\((.*)\)$/, "$1");
    const fields = (link?.code === "P2002" && Array.isArray(link?.meta?.target) ? link.meta.target : listed ?? keyed)?.map(unwrap);
    if (fields?.length) {
      const target = [...fields].map(String).sort().join(",");
      const matches = Object.values(CONSTRAINT_MESSAGES).filter((rule) => rule.fields && [...rule.fields].sort().join(",") === target);
      if (matches.length === 1) return matches[0];
      if (matches.length > 1) return { code: "TOUR_DUPLICATE_RECORD", message: "That record already exists. Reload and check before adding it again." };
    }
  }
  return null;
}

// features/keystone/lib/tour-command.ts
var hashToken = (token) => (0, import_node_crypto3.createHash)("sha256").update(token).digest("hex");
var ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
var humanCode = (length = 10) => Array.from((0, import_node_crypto3.randomBytes)(length), (b) => ALPHABET[b % ALPHABET.length]).join("");
var secret2 = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET of at least 32 characters is required");
  return s;
};
var derivedToken = (purpose, id) => (0, import_node_crypto3.createHmac)("sha256", secret2()).update(`${purpose}\0${id}`).digest("base64url");
var manageToken = (bookingId, version = 0) => derivedToken("manage", version ? `${bookingId}\0v${version}` : bookingId);
function assertProof(token, hash) {
  const actual = hashToken(token || "");
  if (!hash || actual.length !== hash.length || !(0, import_node_crypto3.timingSafeEqual)(Buffer.from(actual), Buffer.from(hash))) throw new Error("Booking not found");
}
async function authorize(context, capability) {
  if (!context.session?.itemId || !permissions[capability]({ session: context.session })) throw new Error("Not authorized");
  const user = await context.prisma.user.findUnique({ where: { id: context.session.itemId }, include: { role: true } });
  if (!user?.role?.[capability]) throw new Error("Not authorized");
  return user;
}
async function lockTransactionKey(tx, key) {
  const result = await tx.$queryRaw`SELECT true AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))) AS acquired`;
  if (result instanceof Error) throw result;
}
async function audit(tx, actorId, action, targetList, targetId, before, after, reason = "", requestId = "") {
  const result = await tx.auditEvent.create({ data: { actorId, action, targetList, targetId, before: before ?? void 0, after: after ?? void 0, reason, requestId } });
  if (result instanceof Error) throw result;
}
async function command(context, key, operation, params, locks, work) {
  if (!key || key.length > 200) throw new Error("Idempotency key required (maximum 200 characters)");
  const scopedKey = `${operation}:${key}`;
  try {
    return await runCommand(context, operation, scopedKey, params, locks, work);
  } catch (error) {
    throw userFacingError(error);
  }
}
function userFacingError(error) {
  const refusal = constraintRefusal(error);
  if (refusal) return new import_graphql2.GraphQLError(refusal.message, { extensions: { code: refusal.code }, originalError: error });
  if (error instanceof import_graphql2.GraphQLError || /^Prisma/.test(error?.name || "") || !(error instanceof Error)) return error;
  return new import_graphql2.GraphQLError(error.message, { extensions: { code: "KS_USER_INPUT_ERROR" }, originalError: error });
}
async function lockTransactionKeys(tx, keys) {
  const sorted = [...new Set(keys)].sort();
  if (!sorted.length) return;
  const calls = import_client.Prisma.join(sorted.map((k) => import_client.Prisma.sql`pg_advisory_xact_lock(hashtextextended(${k}, 0))`));
  const result = await tx.$queryRaw`SELECT true AS locked FROM (SELECT ${calls}) AS acquired`;
  if (result instanceof Error) throw result;
}
async function claimIdempotencyKey(tx, key, operation, params) {
  const requestParams = { ...canonicalIdempotencyParams(params), _fingerprint: idempotencyFingerprint(params) };
  const id = "c" + (0, import_node_crypto3.randomBytes)(12).toString("hex");
  const rows = await tx.$queryRaw`INSERT INTO "IdempotencyKey" (id, "idempotencyKey", "requestMethod", "requestPath", "requestParams", "recoveryPoint", "lockedAt", "updatedAt")
    VALUES (${id}, ${key}, 'POST', ${operation}, ${JSON.stringify(requestParams)}::jsonb, 'started', now(), now())
    ON CONFLICT ("idempotencyKey") DO NOTHING RETURNING id`;
  if (rows.length) return { attempt: { id }, replay: false };
  const existing = await tx.idempotencyKey.findUnique({ where: { idempotencyKey: key } });
  assertIdempotencyRequest(existing, { key, requestPath: operation, requestParams: params });
  return { attempt: existing, replay: true };
}
async function runCommand(context, operation, scopedKey, params, locks, work) {
  return context.prisma.$transaction(async (tx) => {
    await lockTransactionKeys(tx, [`idempotency:${scopedKey}`, ...locks]);
    const { attempt, replay } = await claimIdempotencyKey(tx, scopedKey, operation, { ...params, actorId: context.session?.itemId || null });
    if (replay && attempt.recoveryPoint === "completed") return attempt.responseBody;
    const result = await work(tx);
    await updateIdempotencyAttempt(tx, attempt.id, "completed", JSON.parse(JSON.stringify(result)), 200);
    return result;
  }, { timeout: 2e4 });
}
var COUNTED = "'confirmed','checked_in','completed','no_show','partially_refunded'";
async function occupancyNumbers(tx, departureId, startAt, excludeHoldId, channelId) {
  const now = /* @__PURE__ */ new Date();
  const reserveChannels = startAt.getTime() - now.getTime() > 864e5;
  const rows = await tx.$queryRawUnsafe(
    `SELECT
    COALESCE((SELECT SUM(seats) FROM "Booking" WHERE departure = $1 AND status IN (${COUNTED})), 0)::int AS booked,
    COALESCE((SELECT SUM(quantity) FROM "InventoryHold" WHERE departure = $1 AND status = 'active' AND "expiresAt" > $2 AND ($3::text IS NULL OR id <> $3)), 0)::int AS held,
    COALESCE((SELECT SUM(GREATEST(0, c.allocation - COALESCE(s.sold, 0))) FROM "Channel" c
      LEFT JOIN (SELECT channel, SUM(seats) AS sold FROM "Booking" WHERE departure = $1 AND status IN (${COUNTED}) GROUP BY channel) s ON s.channel = c.id
      WHERE $4::boolean AND c.active AND c.allocation > 0 AND ($5::text IS NULL OR c.id <> $5)), 0)::int AS allocated,
    d.status, d.capacity, d."bookingCutoffMinutes" AS cutoff,
    (SELECT COUNT(*)::int FROM "InventoryHold" WHERE departure = $1 AND status = 'active' AND "expiresAt" <= $2) AS stale
    FROM "Departure" d WHERE d.id = $1`,
    departureId,
    now,
    excludeHoldId ?? null,
    reserveChannels,
    channelId ?? null
  );
  return rows[0];
}
async function departureOccupancy(tx, departureId, excludeHoldId, channelId) {
  const departure = await tx.departure.findUnique({ where: { id: departureId }, include: { tour: true } });
  if (!departure) throw new Error("Departure not found");
  const { booked, held, allocated } = await occupancyNumbers(tx, departureId, departure.startAt, excludeHoldId, channelId);
  return { departure, booked, held, allocated, remaining: Math.max(0, departure.capacity - booked - held - allocated) };
}

// features/keystone/lib/tour-money.ts
function minor(value, label = "Amount") {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be nonnegative integer minor units`);
  return value;
}
function basisPoints(amount, bps) {
  minor(amount);
  minor(bps, "Basis points");
  if (bps > 1e4) throw new Error("Basis points cannot exceed 10000");
  const result = (BigInt(amount) * BigInt(bps) + BigInt(5e3)) / BigInt(1e4);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Money overflow");
  return Number(result);
}
function settlement(grossCents, commissionBps) {
  const commissionCents = basisPoints(grossCents, commissionBps);
  return { grossCents, commissionCents, netCents: grossCents - commissionCents };
}
function refundPolicyAmount(totalCents, rules2, hoursBefore, weather = false) {
  minor(totalCents);
  if (!Number.isFinite(hoursBefore)) throw new Error("Invalid departure time");
  if (weather) return totalCents;
  const sorted = [...rules2].sort((a, b) => b.hoursBefore - a.hoursBefore);
  for (const rule2 of sorted) {
    if (!Number.isFinite(rule2.hoursBefore) || rule2.hoursBefore < 0) throw new Error("Invalid policy rule");
    minor(rule2.refundBps);
    if (rule2.refundBps > 1e4) throw new Error("Invalid refund basis points");
  }
  const rule = sorted.find((rule2) => hoursBefore >= rule2.hoursBefore);
  return rule ? basisPoints(totalCents, rule.refundBps) : 0;
}
function minimumDecision(booked, minimum, startAt, now = /* @__PURE__ */ new Date()) {
  minor(booked);
  minor(minimum);
  return { reached: booked >= minimum, needsDecision: booked < minimum && startAt.getTime() - now.getTime() <= 864e5 && startAt > now };
}
function quoteTotal(lines, taxBps = 0, discountCents = 0) {
  let subtotalCents = 0, addOnsCents = 0;
  for (const line of lines) {
    minor(line.unitPriceCents);
    minor(line.qty);
    if (!line.qty) throw new Error("Quantity must be positive");
    const amount = minor(line.unitPriceCents * line.qty);
    if (line.kind === "addon") addOnsCents = minor(addOnsCents + amount);
    else subtotalCents = minor(subtotalCents + amount);
  }
  minor(discountCents);
  const taxable = minor(subtotalCents + addOnsCents - discountCents);
  const taxCents = basisPoints(taxable, taxBps);
  return { subtotalCents, addOnsCents, discountCents, taxCents, totalCents: minor(taxable + taxCents) };
}

// features/keystone/lib/tour-pricing.ts
var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function weekdayIn(date, timeZone) {
  return DAYS.indexOf(new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone }).format(date));
}
function applyPricingRules(baseCents, ticketTypeId, startAt, timeZone, rules2) {
  if (!Number.isSafeInteger(baseCents) || baseCents < 0) throw new Error("Invalid base price");
  const day = weekdayIn(startAt, timeZone);
  const matching = rules2.filter((r) => (!r.ticketTypeId || r.ticketTypeId === ticketTypeId) && (!r.validFrom || r.validFrom <= startAt) && (!r.validTo || r.validTo >= startAt) && (!Array.isArray(r.weekdays) || !r.weekdays.length || r.weekdays.includes(day)) && (r.overridePriceCents !== null || r.adjustBps !== null));
  matching.sort((a, b) => Number(!!b.ticketTypeId) - Number(!!a.ticketTypeId) || (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  const rule = matching[0];
  if (!rule) return { unitPriceCents: baseCents, ruleId: null };
  if (rule.overridePriceCents !== null) {
    if (!Number.isSafeInteger(rule.overridePriceCents) || rule.overridePriceCents < 0) throw new Error("Invalid pricing rule");
    return { unitPriceCents: rule.overridePriceCents, ruleId: rule.id };
  }
  const bps = rule.adjustBps;
  if (!Number.isInteger(bps) || bps < -1e4 || bps > 1e5) throw new Error("Invalid pricing rule");
  return { unitPriceCents: Math.round(baseCents * (1e4 + bps) / 1e4), ruleId: rule.id };
}

// features/keystone/mutations/tour-catalog.ts
async function releaseHoldPromos(tx, holdIds) {
  if (holdIds.length) await tx.promoRedemption.updateMany({ where: { holdId: { in: holdIds }, status: "reserved" }, data: { status: "released" } });
}
async function expireStaleHolds(tx, departureId) {
  const stale = await tx.inventoryHold.findMany({ where: { departureId, status: "active", expiresAt: { lte: /* @__PURE__ */ new Date() } }, select: { id: true } });
  if (!stale.length) return 0;
  const ids = stale.map((h) => h.id);
  await tx.inventoryHold.updateMany({ where: { id: { in: ids }, status: "active" }, data: { status: "expired" } });
  await releaseHoldPromos(tx, ids);
  await tx.booking.updateMany({ where: { holdId: { in: ids }, status: "pending_payment" }, data: { status: "cancelled" } });
  return ids.length;
}
async function toursOnSale(_root, _args, context) {
  return context.prisma.tour.findMany({ where: { status: "active", departures: { some: { startAt: { gt: /* @__PURE__ */ new Date() }, status: { in: ["on_sale", "confirmed", "min_not_met"] } } } }, select: { id: true, name: true, slug: true, description: true, durationMinutes: true, images: true, kind: true, minAge: true, highlights: true, whatToBring: true, meetingPoint: { select: { name: true, address: true, instructions: true } }, addOns: { select: { id: true, name: true, priceCents: true, perPerson: true } }, requiresWaiverId: true, cancellationPolicy: { select: { rules: true, weatherFullRefund: true } }, ticketTypes: { where: { active: true }, select: { id: true, name: true, priceCents: true, currencyCode: true } } }, take: 100 });
}
async function tourAvailability(_root, args, context) {
  const from = new Date(args.from), to = new Date(args.to);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from || to.getTime() - from.getTime() > 92 * 864e5) throw new Error("Choose a valid date range of at most 92 days");
  const rows = await context.prisma.departure.findMany({ where: { tourId: args.tourId, tour: { status: "active" }, startAt: { gte: from, lte: to }, status: { in: ["on_sale", "confirmed", "min_not_met", "full"] } }, select: { id: true, startAt: true, endAt: true, capacity: true, bookingCutoffMinutes: true }, take: 500, orderBy: { startAt: "asc" } });
  const ids = rows.map((r) => r.id);
  const LIVE6 = ["confirmed", "checked_in", "completed", "no_show", "partially_refunded"];
  const [booked, held, channels, channelSold] = await Promise.all([
    context.prisma.booking.groupBy({ by: ["departureId"], where: { departureId: { in: ids }, status: { in: LIVE6 } }, _sum: { seats: true } }),
    context.prisma.inventoryHold.groupBy({ by: ["departureId"], where: { departureId: { in: ids }, status: "active", expiresAt: { gt: /* @__PURE__ */ new Date() } }, _sum: { quantity: true } }),
    context.prisma.channel.findMany({ where: { active: true, allocation: { gt: 0 } } }),
    context.prisma.booking.groupBy({ by: ["departureId", "channelId"], where: { departureId: { in: ids }, channelId: { not: null }, status: { in: LIVE6 } }, _sum: { seats: true } })
  ]);
  const sum = (rows2, id, key) => rows2.find((r) => r.departureId === id)?._sum[key] || 0;
  const result = [];
  for (const row of rows) {
    if (row.startAt.getTime() - row.bookingCutoffMinutes * 6e4 <= Date.now()) continue;
    const far = row.startAt.getTime() - Date.now() > 864e5;
    const reserved = far ? channels.reduce((n, c) => n + Math.max(0, c.allocation - (channelSold.find((x) => x.departureId === row.id && x.channelId === c.id)?._sum.seats || 0)), 0) : 0;
    result.push({ ...row, remaining: Math.max(0, row.capacity - sum(booked, row.id, "seats") - sum(held, row.id, "quantity") - reserved) });
  }
  return result;
}
async function createDepartureHold(_root, args, context) {
  const input = args.input;
  if (!input.token || input.token.length < 32 || input.token.length > 256) throw new Error("Guest proof must contain 32\u2013256 characters");
  return command(context, args.idempotencyKey, "createDepartureHold", input, [`departure:${input.departureId}`], (tx) => placeHold(tx, input, context.session?.itemId || null, args.idempotencyKey));
}
async function placeHold(tx, input, actorId, requestId, channelId, ttlMs = 6e5) {
  await expireStaleHolds(tx, input.departureId);
  const o = await departureOccupancy(tx, input.departureId, void 0, channelId);
  const d = o.departure;
  if (d.tour.status !== "active" || !["on_sale", "confirmed", "min_not_met", "full"].includes(d.status) || d.startAt.getTime() - d.bookingCutoffMinutes * 6e4 <= Date.now()) throw new Error("Departure is not on sale");
  if (!Array.isArray(input.tickets) || !input.tickets.length || input.tickets.length > 20) throw new Error("Choose ticket quantities");
  const lines = [];
  let seats = 0;
  const pricingRules = await tx.pricingRule.findMany({ where: { tourId: d.tourId } });
  for (const chosen of input.tickets) {
    if (!Number.isSafeInteger(chosen.qty) || chosen.qty < 1 || chosen.qty > 100) throw new Error("Invalid quantity");
    const ticket = await tx.ticketType.findFirst({ where: { id: chosen.id, tourId: d.tourId, active: true } });
    if (!ticket) throw new Error("Ticket not offered on this tour");
    seats += ticket.countsTowardCapacity ? ticket.seatsUsed * chosen.qty : 0;
    const priced = applyPricingRules(ticket.priceCents, ticket.id, d.startAt, d.tour.timezone || "America/New_York", pricingRules);
    lines.push({ catalogId: ticket.id, name: ticket.name, unitPriceCents: priced.unitPriceCents, basePriceCents: ticket.priceCents, pricingRuleId: priced.ruleId, qty: chosen.qty, seatsUsed: ticket.countsTowardCapacity ? ticket.seatsUsed : 0, kind: "ticket", minAge: ticket.minAge, maxAge: ticket.maxAge });
  }
  if (!seats || seats > o.remaining) throw new Error("Not enough seats");
  if ((input.addOns || []).length > 20) throw new Error("Too many add-ons");
  for (const chosen of input.addOns || []) {
    const addOn = await tx.addOn.findFirst({ where: { id: chosen.id, tourId: d.tourId } });
    if (!addOn || !Number.isSafeInteger(chosen.qty) || chosen.qty < 1 || chosen.qty > 100) throw new Error("Invalid add-on");
    if (addOn.inventory !== null) {
      const booked = await tx.bookingLine.aggregate({ where: { catalogId: addOn.id, booking: { departureId: d.id, status: { in: ["confirmed", "checked_in", "completed", "partially_refunded"] } } }, _sum: { qty: true } });
      const holds = await tx.inventoryHold.findMany({ where: { departureId: d.id, status: "active", expiresAt: { gt: /* @__PURE__ */ new Date() } }, select: { quote: true } });
      const held = holds.reduce((n, h) => n + (h.quote?.lines || []).filter((l) => l.catalogId === addOn.id).reduce((a, l) => a + l.qty, 0), 0);
      if (chosen.qty + held + (booked._sum.qty || 0) > addOn.inventory) throw new Error("Add-on unavailable");
    }
    lines.push({ catalogId: addOn.id, name: addOn.name, unitPriceCents: addOn.priceCents, qty: chosen.qty, seatsUsed: 0, kind: "addon" });
  }
  const settings = await tx.storeSettings.findFirst();
  const policy = d.tour.cancellationPolicyId ? await tx.cancellationPolicy.findUnique({ where: { id: d.tour.cancellationPolicyId } }) : null;
  let discountCents = 0, promo = null;
  if (input.promoCode) {
    promo = await tx.promoCode.findUnique({ where: { code: String(input.promoCode).trim().toUpperCase() }, include: { tours: { select: { id: true } } } });
    const now = /* @__PURE__ */ new Date();
    if (!promo || promo.status !== "active" || promo.startsAt && promo.startsAt > now || promo.endsAt && promo.endsAt < now || promo.tours.length && !promo.tours.some((t) => t.id === d.tourId)) throw new Error("Promo code is not valid");
    await lockTransactionKey(tx, `promo:${promo.id}`);
    const reserved = await tx.promoRedemption.count({ where: { promoCodeId: promo.id, status: { in: ["reserved", "committed"] } } });
    if (promo.maxUses !== null && reserved >= promo.maxUses) throw new Error("Promo code is fully used");
    const base = lines.reduce((n, l) => n + l.unitPriceCents * l.qty, 0);
    discountCents = promo.discountType === "comp" ? base : promo.discountType === "percent_bps" ? basisPoints(base, promo.value) : Math.min(base, promo.value);
  }
  const quote = { lines, ...quoteTotal(lines, settings?.taxBps || 0, discountCents), promo: promo ? { id: promo.id, code: promo.code, discountType: promo.discountType, value: promo.value } : null, seats, currencyCode: settings?.currencyCode || "USD", tour: { id: d.tour.id, name: d.tour.name, timezone: d.tour.timezone, startAt: d.startAt, endAt: d.endAt, meetingPointId: d.tour.meetingPointId, waiverTemplateId: d.tour.requiresWaiverId, meetingPoint: d.tour.meetingPointId ? await tx.meetingPoint.findUnique({ where: { id: d.tour.meetingPointId }, select: { name: true, address: true, instructions: true, mapLink: true } }) : null }, policy: { rules: policy?.rules || [], weatherFullRefund: policy?.weatherFullRefund ?? true } };
  const hold = await tx.inventoryHold.create({ data: { departureId: d.id, quantity: seats, cartTokenHash: hashToken(input.token), expiresAt: new Date(Date.now() + ttlMs), status: "active", quote } });
  if (promo) await tx.promoRedemption.create({ data: { promoCodeId: promo.id, holdId: hold.id, amountCents: discountCents, currencyCode: quote.currencyCode, status: "reserved" } });
  await audit(tx, actorId, "hold.created", "InventoryHold", hold.id, null, { seats, departureId: d.id }, "", requestId);
  return { holdId: hold.id, expiresAt: hold.expiresAt, quote };
}
function plainText(node) {
  if (!node) return "";
  if (Array.isArray(node)) return node.map(plainText).join("\n");
  if (typeof node.text === "string") return node.text;
  return plainText(node.children);
}
async function waiverForToken(_root, args, context) {
  const participant = await context.prisma.participant.findFirst({ where: { waiverTokenHash: hashToken(String(args.token || "")) }, include: { booking: true } });
  if (!participant) throw new Error("Waiver link not valid");
  const templateId = participant.booking.tourSnapshot?.waiverTemplateId;
  const template = templateId && await context.prisma.waiverTemplate.findUnique({ where: { id: templateId } });
  if (!template || template.status !== "published") throw new Error("Waiver unavailable");
  return { participantName: participant.fullName, status: participant.waiverStatus, name: template.name, version: template.version, text: plainText(template.body), tourName: participant.booking.tourSnapshot?.name };
}

// features/keystone/mutations/tour-checkout.ts
var import_node_crypto7 = require("node:crypto");

// features/keystone/lib/tour-notifications.ts
var PREFERENCE_FOR = { booking_confirmation: "bookingUpdates", day_before_reminder: "bookingUpdates", weather_cancellation: "weatherCancellation", waitlist_offer: "bookingUpdates" };
var OPT_OUT_REASON = { bookingUpdates: "Guest opted out of booking updates", weatherCancellation: "Guest opted out of weather cancellation notices" };
function decideNotification(email, pref, kind) {
  const to = String(email || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { status: "suppressed", reason: "No valid email address for this guest" };
  const field = PREFERENCE_FOR[kind];
  if (pref && pref[field] === false) return { status: "suppressed", reason: OPT_OUT_REASON[field] };
  return { status: "queued", reason: "" };
}
var notificationRequestId = (kind, bookingId) => `notify:${kind}:${bookingId}`;
var when = (startAt, timezone) => {
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: timezone || "UTC" }).format(new Date(startAt));
  } catch {
    return new Date(startAt).toISOString();
  }
};
function composeNotification(kind, booking, trip) {
  const name3 = String(booking.guestName || "").trim() || "there";
  const mp = trip.meetingPoint;
  const meet = mp?.name ? `
Meet at: ${[mp.name, mp.address].filter(Boolean).join(", ")}${mp.instructions ? `
${mp.instructions}` : ""}` : "";
  const at = when(trip.startAt, trip.timezone);
  if (kind === "booking_confirmation") {
    return { subject: `Booking ${booking.bookingRef} confirmed: ${trip.tourName}`, text: `Hi ${name3},

Your booking ${booking.bookingRef} for ${trip.tourName} on ${at} is confirmed.${meet}` };
  }
  if (kind === "waitlist_offer") {
    const until = trip.offerExpiresAt ? when(trip.offerExpiresAt, trip.timezone) : "soon";
    return { subject: `Seats are free: ${trip.tourName}`, text: `Hi ${name3},

${trip.seats || "The"} seat${trip.seats === 1 ? " is" : "s are"} now held for you on ${trip.tourName} on ${at}. Open the waitlist link you received when you joined to book them before ${until}. After that the seats go to the next guest.` };
  }
  if (kind === "weather_cancellation") {
    const refund = typeof trip.refundCents === "number" ? new Intl.NumberFormat("en-US", { style: "currency", currency: trip.currency || "USD" }).format(trip.refundCents / 100) : "your payment";
    return { subject: `Cancelled for weather: ${trip.tourName} (${booking.bookingRef})`, text: `Hi ${name3},

We have cancelled ${trip.tourName} on ${at} because of weather. You can rebook onto another departure of the same tour, or take a full refund of ${refund}. Reply to this message or call us and we will arrange whichever you prefer.

Booking reference: ${booking.bookingRef}` };
  }
  return { subject: `Tomorrow: ${trip.tourName} (${booking.bookingRef})`, text: `Hi ${name3},

A reminder that ${trip.tourName} departs on ${at}.${meet}

Booking reference: ${booking.bookingRef}` };
}
function notificationAfter(kind, booking, trip, pref) {
  const decision = decideNotification(booking.guestEmail || "", pref, kind);
  const message = composeNotification(kind, booking, trip);
  const action = decision.status === "queued" ? "notification.queued" : "notification.suppressed";
  return { action, reason: decision.reason, after: { kind, channel: "email", to: String(booking.guestEmail || "").trim().toLowerCase(), subject: message.subject, text: message.text, bookingRef: booking.bookingRef, status: decision.status } };
}
var REMINDER_WINDOW_MS = 25 * 36e5;

// features/keystone/mutations/tour-operator-booking.ts
var import_node_crypto4 = require("node:crypto");
var newId = () => "c" + (0, import_node_crypto4.randomBytes)(12).toString("hex");
async function fastOperatorBooking(context, args, user) {
  const i = args.input, db = context.prisma;
  const departure = await db.departure.findUnique({ where: { id: i.departureId }, include: { tour: { include: { ticketTypes: true } } } });
  if (!departure) throw new Error("Departure not found");
  const tour = departure.tour;
  const wantedAddOns = i.addOns || [];
  if (wantedAddOns.length > 20) throw new Error("Too many add-ons");
  const leadEmail = String(i.lead?.email || "").trim().toLowerCase();
  const [pricingRules, settings, policy, meetingPoint, channel, addOnRows, promoRow, notifyPref] = await Promise.all([
    db.pricingRule.findMany({ where: { tourId: tour.id } }),
    db.storeSettings.findFirst(),
    tour.cancellationPolicyId ? db.cancellationPolicy.findUnique({ where: { id: tour.cancellationPolicyId } }) : null,
    tour.meetingPointId ? db.meetingPoint.findUnique({ where: { id: tour.meetingPointId }, select: { name: true, address: true, instructions: true, mapLink: true } }) : null,
    i.source === "reseller" ? db.channel.findUnique({ where: { id: i.channelId } }) : null,
    wantedAddOns.length ? db.addOn.findMany({ where: { tourId: tour.id, id: { in: wantedAddOns.map((a) => String(a.id)) } } }) : [],
    i.promoCode ? db.promoCode.findUnique({ where: { code: String(i.promoCode).trim().toUpperCase() }, include: { tours: { select: { id: true } } } }) : null,
    leadEmail ? db.notificationPreference.findUnique({ where: { email: leadEmail } }) : null
  ]);
  if (i.promoCode) {
    const now = /* @__PURE__ */ new Date();
    if (!promoRow || promoRow.status !== "active" || promoRow.startsAt && promoRow.startsAt > now || promoRow.endsAt && promoRow.endsAt < now || promoRow.tours.length && !promoRow.tours.some((t) => t.id === tour.id)) throw new Error("Promo code is not valid");
  }
  if (i.source === "reseller" && !channel?.active) throw new Error("Channel unavailable");
  return command(context, args.idempotencyKey, "createChannelBooking", i, [`departure:${departure.id}`, ...promoRow ? [`promo:${promoRow.id}`] : []], async (tx) => {
    const d = departure;
    const occ = await occupancyNumbers(tx, d.id, d.startAt, void 0, channel?.id);
    const state2 = occ;
    if (!state2?.status) throw new Error("Departure not found");
    if (state2.stale > 0) {
      const stale = (await tx.inventoryHold.findMany({ where: { departureId: d.id, status: "active", expiresAt: { lte: /* @__PURE__ */ new Date() } }, select: { id: true } })).map((h) => h.id);
      await tx.inventoryHold.updateMany({ where: { id: { in: stale } }, data: { status: "expired" } });
      await tx.promoRedemption.updateMany({ where: { holdId: { in: stale }, status: "reserved" }, data: { status: "released" } });
      await tx.booking.updateMany({ where: { holdId: { in: stale }, status: "pending_payment" }, data: { status: "cancelled" } });
    }
    if (tour.status !== "active" || !["on_sale", "confirmed", "min_not_met", "full"].includes(state2.status) || d.startAt.getTime() - (state2.cutoff ?? 0) * 6e4 <= Date.now()) throw new Error("Departure is not on sale");
    if (!Array.isArray(i.tickets) || !i.tickets.length || i.tickets.length > 20) throw new Error("Choose ticket quantities");
    const lines = [];
    let seats = 0;
    for (const chosen of i.tickets) {
      if (!Number.isSafeInteger(chosen.qty) || chosen.qty < 1 || chosen.qty > 100) throw new Error("Invalid quantity");
      const ticket = tour.ticketTypes.find((t) => t.id === chosen.id && t.active);
      if (!ticket) throw new Error("Ticket not offered on this tour");
      seats += ticket.countsTowardCapacity ? ticket.seatsUsed * chosen.qty : 0;
      const priced = applyPricingRules(ticket.priceCents, ticket.id, d.startAt, tour.timezone || "America/New_York", pricingRules);
      lines.push({ catalogId: ticket.id, name: ticket.name, unitPriceCents: priced.unitPriceCents, basePriceCents: ticket.priceCents, pricingRuleId: priced.ruleId, qty: chosen.qty, seatsUsed: ticket.countsTowardCapacity ? ticket.seatsUsed : 0, kind: "ticket", minAge: ticket.minAge, maxAge: ticket.maxAge });
    }
    if (!seats || seats > Math.max(0, state2.capacity - occ.booked - occ.held - occ.allocated)) throw new Error("Not enough seats");
    for (const chosen of wantedAddOns) {
      const addOn = addOnRows.find((a) => a.id === chosen.id);
      if (!addOn || !Number.isSafeInteger(chosen.qty) || chosen.qty < 1 || chosen.qty > 100) throw new Error("Invalid add-on");
      if (addOn.inventory !== null) {
        const booked2 = await tx.bookingLine.aggregate({ where: { catalogId: addOn.id, booking: { departureId: d.id, status: { in: ["confirmed", "checked_in", "completed", "partially_refunded"] } } }, _sum: { qty: true } });
        const holds = await tx.inventoryHold.findMany({ where: { departureId: d.id, status: "active", expiresAt: { gt: /* @__PURE__ */ new Date() } }, select: { quote: true } });
        const held = holds.reduce((n, h) => n + (h.quote?.lines || []).filter((l) => l.catalogId === addOn.id).reduce((a, l) => a + l.qty, 0), 0);
        if (chosen.qty + held + (booked2._sum.qty || 0) > addOn.inventory) throw new Error("Add-on unavailable");
      }
      lines.push({ catalogId: addOn.id, name: addOn.name, unitPriceCents: addOn.priceCents, qty: chosen.qty, seatsUsed: 0, kind: "addon" });
    }
    let discountCents = 0;
    if (promoRow) {
      const used = await tx.promoRedemption.count({ where: { promoCodeId: promoRow.id, status: { in: ["reserved", "committed"] } } });
      if (promoRow.maxUses !== null && used >= promoRow.maxUses) throw new Error("Promo code is fully used");
      const base = lines.reduce((n, l) => n + l.unitPriceCents * l.qty, 0);
      discountCents = promoRow.discountType === "comp" ? base : promoRow.discountType === "percent_bps" ? basisPoints(base, promoRow.value) : Math.min(base, promoRow.value);
    }
    const promo = promoRow ? { id: promoRow.id, code: promoRow.code, discountType: promoRow.discountType, value: promoRow.value } : null;
    const quote = {
      lines,
      ...quoteTotal(lines, settings?.taxBps || 0, discountCents),
      promo,
      seats,
      currencyCode: settings?.currencyCode || "USD",
      tour: { id: tour.id, name: tour.name, timezone: tour.timezone, startAt: d.startAt, endAt: d.endAt, meetingPointId: tour.meetingPointId, waiverTemplateId: tour.requiresWaiverId, meetingPoint },
      policy: { rules: policy?.rules || [], weatherFullRefund: policy?.weatherFullRefund ?? true },
      departureId: d.id
    };
    const participants = buildParticipants(quote, i.participants);
    const guestName = String(i.lead.name || "").trim(), guestEmail = String(i.lead.email || "").trim().toLowerCase();
    if (!guestName || !guestEmail.includes("@")) throw new Error("Lead booker name and email required");
    const holdId = newId(), bookingId = newId(), bookingRef = `TG-${humanCode(8)}`;
    const note = notificationAfter("booking_confirmation", { bookingRef, guestName, guestEmail }, { tourName: tour.name, startAt: d.startAt, timezone: tour.timezone, meetingPoint }, notifyPref);
    const commission = channel ? basisPoints(quote.totalCents, channel.commissionBps) : 0;
    const waiver = Boolean(quote.tour.waiverTemplateId);
    const pay = quote.totalCents > 0 && !(channel && channel.paymentModel === "channel_collects");
    const booked = occ.booked + seats;
    const nextStatus = !["scheduled", "on_sale", "min_not_met", "confirmed", "full"].includes(state2.status) ? state2.status : booked >= state2.capacity ? "full" : booked >= (tour.minParticipants ?? 1) ? "confirmed" : state2.status === "min_not_met" ? "min_not_met" : "on_sale";
    const people = participants.map((p2) => {
      const id = newId();
      return { id, fullName: p2.fullName, age: p2.age, email: p2.email, dietary: p2.dietary, medicalNotes: p2.medicalNotes, snapshot: p2.snapshot, token: waiver ? hashToken(derivedToken("waiver", id)) : null };
    });
    const lineRows = lines.map((l) => ({ id: newId(), name: l.name, unit: l.unitPriceCents, qty: l.qty, seatsUsed: l.seatsUsed, kind: l.kind, total: l.unitPriceCents * l.qty, catalogId: l.catalogId }));
    await tx.$executeRaw`
      WITH h AS (INSERT INTO "InventoryHold" (id, departure, quantity, "cartTokenHash", "expiresAt", status, quote, "updatedAt")
        VALUES (${holdId}, ${d.id}, ${seats}, ${hashToken(derivedToken("operator-hold", args.idempotencyKey + ":" + d.id))}, now() + interval '60 seconds', 'converted'::"InventoryHoldStatusType", ${JSON.stringify(quote)}::jsonb, now())),
      b AS (INSERT INTO "Booking" (id, "bookingRef", departure, "guestName", "guestEmail", "guestPhone", status, channel, source, "subtotalCents", "addOnsCents", "discountCents", "taxCents", "totalCents",
          "channelCommissionCents", "currencyCode", seats, "policySnapshot", "tourSnapshot", hold, "specialRequests", "pickupLocation", "updatedAt")
        VALUES (${bookingId}, ${bookingRef}, ${d.id}, ${guestName}, ${guestEmail}, ${String(i.lead.phone || "")}, 'confirmed'::"BookingStatusType", ${channel?.id ?? null}, ${i.source}::"BookingSourceType",
          ${quote.subtotalCents}, ${quote.addOnsCents}, ${quote.discountCents}, ${quote.taxCents}, ${quote.totalCents}, ${commission}, ${quote.currencyCode}, ${seats},
          ${JSON.stringify(quote.policy)}::jsonb, ${JSON.stringify({ ...quote.tour, promo })}::jsonb, ${holdId}, ${String(i.lead.specialRequests || "")}, ${String(i.lead.pickupLocation || "")}, now())),
      l AS (INSERT INTO "BookingLine" (id, booking, name, "unitPriceCents", qty, "seatsUsed", kind, "totalCents", "currencyCode", "catalogId", "updatedAt")
        SELECT x.id, ${bookingId}, x.name, x.unit, x.qty, x."seatsUsed", x.kind::"BookingLineKindType", x.total, ${quote.currencyCode}, x."catalogId", now()
        FROM jsonb_to_recordset(${JSON.stringify(lineRows)}::jsonb) AS x(id text, name text, unit int, qty int, "seatsUsed" int, kind text, total int, "catalogId" text)),
      p AS (INSERT INTO "Participant" (id, booking, "fullName", age, email, dietary, "medicalNotes", "ticketTypeSnapshot", "waiverStatus", "waiverTokenHash", "updatedAt")
        SELECT x.id, ${bookingId}, x."fullName", x.age, x.email, x.dietary, x."medicalNotes", x.snapshot, ${waiver ? "required" : "not_required"}::"ParticipantWaiverStatusType", x.token, now()
        FROM jsonb_to_recordset(${JSON.stringify(people)}::jsonb) AS x(id text, "fullName" text, age int, email text, dietary text, "medicalNotes" text, snapshot jsonb, token text)),
      pay AS (INSERT INTO "Payment" (id, "idempotencyKey", amount, "currencyCode", status, "paymentMethod", "order", "processedAt", "processedBy", notes, "updatedAt")
        SELECT ${newId()}, ${"tour-payment:" + bookingId}, ${quote.totalCents}, ${quote.currencyCode}, 'succeeded', 'cash', ${bookingId}, now(), ${user.id}, 'Collected by operator', now() WHERE ${pay}),
      red AS (INSERT INTO "PromoRedemption" (id, "promoCode", booking, "holdId", "amountCents", "currencyCode", status, "updatedAt")
        SELECT ${newId()}, ${promo?.id ?? ""}, ${bookingId}, ${holdId}, ${discountCents}, ${quote.currencyCode}, 'committed'::"PromoRedemptionStatusType", now() WHERE ${Boolean(promo)}),
      use AS (UPDATE "PromoCode" SET "usedCount" = COALESCE("usedCount", 0) + 1, "updatedAt" = now() WHERE id = ${promo?.id ?? ""}),
      dep AS (UPDATE "Departure" SET status = ${nextStatus}::"DepartureStatusType", "updatedAt" = now() WHERE id = ${d.id} AND status::text <> ${nextStatus})
      INSERT INTO "AuditEvent" (id, actor, action, "targetList", "targetId", before, after, reason, "requestId", "updatedAt") VALUES
        (${newId()}, ${user.id}, 'hold.created', 'InventoryHold', ${holdId}, NULL, ${JSON.stringify({ seats, departureId: d.id })}::jsonb, '', ${args.idempotencyKey}, now()),
        (${newId()}, ${user.id}, 'booking.confirmed', 'Booking', ${bookingId}, ${JSON.stringify({ status: "pending_payment" })}::jsonb, ${JSON.stringify({ status: "confirmed", seats })}::jsonb, '', ${args.idempotencyKey}, now()),
        (${newId()}, ${user.id}, ${note.action}, 'Notification', ${"booking_confirmation:" + bookingId}, NULL, ${JSON.stringify(note.after)}::jsonb, ${note.reason}, ${notificationRequestId("booking_confirmation", bookingId)}, now())`;
    return { bookingRef, waivers: [] };
  });
}

// features/integrations/payment/index.ts
var paymentProviderAdapters = {
  stripe: () => Promise.resolve().then(() => (init_stripe(), stripe_exports)),
  manual: () => Promise.resolve().then(() => (init_manual(), manual_exports))
};

// features/keystone/utils/paymentProviderAdapter.ts
var ADAPTERS = new Set(Object.keys(paymentProviderAdapters));
var ADAPTER_OPERATIONS = /* @__PURE__ */ new Set(["createPaymentFunction", "capturePaymentFunction", "refundPaymentFunction", "getPaymentStatusFunction", "generatePaymentLinkFunction", "handleWebhookFunction", "cancelPaymentFunction"]);
function paymentAdapterPayload(provider3, args) {
  const projectedProvider = { id: provider3.id, code: provider3.code, credentials: provider3.credentials || {} };
  const input = {};
  for (const key of ["cart", "order", "amount", "currency", "idempotencyKey", "paymentId", "refundId", "event", "headers", "rawBody"]) {
    if (args?.[key] !== void 0) input[key] = args[key];
  }
  for (const key of ["cart", "order"]) {
    const record = input[key];
    if (record && typeof record === "object") {
      input[key] = Object.fromEntries(["id", "orderNumber", "orderType", "currencyCode", "subtotal", "tax", "tip", "discount", "total", "customerName", "customerEmail", "email"].filter((field) => record[field] !== void 0).map((field) => [field, record[field]]));
    }
  }
  if (input.headers && typeof input.headers === "object") {
    input.headers = Object.fromEntries(Object.entries(input.headers).filter(([key]) => key.toLowerCase() === "stripe-signature" || key.toLowerCase().startsWith("paypal-")));
  }
  return { ...input, provider: projectedProvider };
}
async function executeAdapterFunction({ provider: provider3, functionName, args }) {
  if (!ADAPTER_OPERATIONS.has(functionName)) throw new Error("Unknown payment adapter operation");
  const functionPath = provider3?.[functionName];
  if (typeof functionPath !== "string") throw new Error("Payment adapter is not configured");
  const payload = paymentAdapterPayload(provider3, args);
  if (/^https?:/i.test(functionPath)) {
    const endpoint2 = functionPath;
    try {
      const response = await fetch(endpoint2, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(3e4),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("Payment adapter rejected request");
      return await response.json();
    } catch {
      throw new Error("External payment adapter request failed; reconcile the original attempt before retrying");
    }
  }
  if (!ADAPTERS.has(functionPath)) throw new Error("Unknown registered payment adapter");
  const adapter = await paymentProviderAdapters[functionPath]();
  const fn = adapter[functionName];
  if (typeof fn !== "function") throw new Error("Payment adapter operation is unavailable");
  try {
    return await fn(payload);
  } catch {
    throw new Error(`Payment adapter ${functionName} failed; reconcile the original attempt before retrying`);
  }
}
async function createPayment({ provider: provider3, cart, order, amount, currency: currency2, idempotencyKey }) {
  return executeAdapterFunction({
    provider: provider3,
    functionName: "createPaymentFunction",
    args: { cart, order, amount, currency: currency2, idempotencyKey }
  });
}
async function refundPayment({ provider: provider3, paymentId, amount, currency: currency2, idempotencyKey, refundId }) {
  return executeAdapterFunction({
    provider: provider3,
    functionName: "refundPaymentFunction",
    args: { paymentId, amount, currency: currency2, idempotencyKey, refundId }
  });
}
async function getPaymentStatus({ provider: provider3, paymentId }) {
  return executeAdapterFunction({
    provider: provider3,
    functionName: "getPaymentStatusFunction",
    args: { paymentId }
  });
}
async function cancelPayment({ provider: provider3, paymentId, idempotencyKey }) {
  const selector = provider3.getPaymentStatusFunction;
  if (!["stripe", "paypal", "manual"].includes(selector)) throw new Error("External payment adapter cancellation contract is not configured");
  return executeAdapterFunction({ provider: { ...provider3, cancelPaymentFunction: selector }, functionName: "cancelPaymentFunction", args: { paymentId, idempotencyKey } });
}

// features/keystone/utils/paymentProviderConfig.ts
function isPaymentProviderConfigured(code) {
  if (code.startsWith("pp_stripe")) {
    return Boolean(
      (process.env.NEXT_PUBLIC_STRIPE_KEY || process.env.STRIPE_PUBLISHABLE_KEY) && process.env.STRIPE_SECRET_KEY
    );
  }
  if (code.startsWith("pp_paypal")) {
    return Boolean(process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
  }
  return code === "pp_system_default" || code.startsWith("pp_manual");
}
function getPublicPaymentProviderConfig(code) {
  if (!isPaymentProviderConfigured(code)) return null;
  if (code.startsWith("pp_stripe")) {
    return {
      provider: "stripe",
      publishableKey: process.env.NEXT_PUBLIC_STRIPE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || ""
    };
  }
  if (code.startsWith("pp_paypal")) {
    return {
      provider: "paypal",
      publishableKey: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || ""
    };
  }
  return null;
}

// features/keystone/mutations/tour-waitlist.ts
var import_node_crypto5 = require("node:crypto");

// features/keystone/lib/tour-waitlist.ts
function pickOffers(waiting, free) {
  const out = [];
  let left = Math.max(0, Math.floor(free || 0));
  for (const e of [...waiting].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt) || a.id.localeCompare(b.id))) {
    if (left <= 0) break;
    if (e.seats <= left) {
      out.push(e.id);
      left -= e.seats;
    }
  }
  return out;
}
function offerExpiry(now, startAt, cutoffMinutes, offerHours) {
  const closes = new Date(startAt).getTime() - (cutoffMinutes ?? 0) * 6e4;
  const until = Math.min(now.getTime() + Math.max(1, offerHours || 12) * 36e5, closes);
  return until - now.getTime() < 10 * 6e4 ? null : new Date(until);
}
function positionOf(id, waiting) {
  const sorted = [...waiting].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt) || a.id.localeCompare(b.id));
  const i = sorted.findIndex((e) => e.id === id);
  return i < 0 ? null : i + 1;
}
var waitlistLinkPath = (entryId, token) => `/waitlist#${entryId}.${token}`;

// features/keystone/mutations/tour-waitlist.ts
var OPEN = ["on_sale", "confirmed", "min_not_met", "full"];
var LIVE = ["waiting", "offered"];
var waitlistToken = (entryId) => derivedToken("waitlist", entryId);
var linkFor = (id) => waitlistLinkPath(id, waitlistToken(id));
var norm = (s) => String(s || "").trim().toLowerCase();
function assertWaitlistProof(entryId, token) {
  const expected = Buffer.from(waitlistToken(entryId)), given = Buffer.from(String(token || ""));
  if (given.length !== expected.length || !(0, import_node_crypto5.timingSafeEqual)(expected, given)) throw new Error("Waitlist entry not found");
}
async function promoteWaitlist(tx, departureId, actorId) {
  const now = /* @__PURE__ */ new Date();
  const live = await tx.waitlistEntry.findMany({ where: { departureId, status: { in: LIVE } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  if (!live.length) return { offered: 0, expired: 0 };
  let expired = 0, offered = 0;
  for (const e of live.filter((x) => x.status === "offered" && x.offerExpiresAt && x.offerExpiresAt <= now)) {
    const hold = e.offerHoldId ? await tx.inventoryHold.findUnique({ where: { id: e.offerHoldId } }) : null;
    if (hold?.status === "converted") continue;
    if (hold?.status === "active") {
      await tx.inventoryHold.update({ where: { id: hold.id }, data: { status: "expired" } });
      await tx.booking.updateMany({ where: { holdId: hold.id, status: "pending_payment" }, data: { status: "cancelled" } });
    }
    await tx.waitlistEntry.update({ where: { id: e.id }, data: { status: "expired", note: "Offer not taken in time" } });
    await audit(tx, actorId, "waitlist.offer_expired", "WaitlistEntry", e.id, { status: "offered" }, { status: "expired" });
    expired++;
  }
  const waiting = live.filter((x) => x.status === "waiting");
  if (!waiting.length) return { offered, expired };
  const o = await departureOccupancy(tx, departureId);
  const d = o.departure;
  if (d.tour.status !== "active" || !OPEN.includes(d.status)) return { offered, expired };
  const settings = await tx.storeSettings.findFirst({ select: { waitlistOfferHours: true } });
  const until = offerExpiry(now, d.startAt, d.bookingCutoffMinutes, settings?.waitlistOfferHours);
  if (!until) return { offered, expired };
  for (const id of pickOffers(waiting, o.remaining)) {
    const e = waiting.find((x) => x.id === id);
    let hold;
    try {
      hold = await placeHold(tx, { departureId, tickets: e.tickets, addOns: [], token: derivedToken("waitlist-hold", e.id) }, actorId, `waitlist:${e.id}`, void 0, until.getTime() - now.getTime());
    } catch (err) {
      if (/Not enough seats/.test(err?.message || "")) continue;
      await tx.waitlistEntry.update({ where: { id: e.id }, data: { status: "expired", note: `Could not offer: ${err?.message || "tickets unavailable"}` } });
      await audit(tx, actorId, "waitlist.offer_failed", "WaitlistEntry", e.id, { status: "waiting" }, { status: "expired" }, String(err?.message || ""));
      continue;
    }
    await tx.waitlistEntry.update({ where: { id: e.id }, data: { status: "offered", offerHoldId: hold.holdId, offeredAt: now, offerExpiresAt: until } });
    await audit(tx, actorId, "waitlist.offered", "WaitlistEntry", e.id, { status: "waiting" }, { status: "offered", holdId: hold.holdId, seats: e.seats, offerExpiresAt: until });
    await queueGuestNotification(tx, "waitlist_offer", { id: e.id, bookingRef: "", guestName: e.guestName, guestEmail: e.guestEmail }, { tourName: d.tour.name, startAt: d.startAt, timezone: d.tour.timezone, offerExpiresAt: until, seats: e.seats }, actorId);
    offered++;
  }
  return { offered, expired };
}
async function markWaitlistConverted(tx, holdId, bookingRef) {
  await tx.waitlistEntry.updateMany({ where: { offerHoldId: holdId, status: { in: LIVE } }, data: { status: "converted", bookingRef } });
}
async function closeWaitlist(tx, departureId, note) {
  await tx.waitlistEntry.updateMany({ where: { departureId, status: { in: LIVE } }, data: { status: "expired", note } });
}
async function joinInTx(tx, i, source, actorId) {
  const o = await departureOccupancy(tx, String(i.departureId || ""));
  const d = o.departure;
  if (d.tour.status !== "active" || !OPEN.includes(d.status) || d.startAt.getTime() - (d.bookingCutoffMinutes ?? 0) * 6e4 <= Date.now()) throw new Error("This departure is not taking bookings or waitlist requests");
  const name3 = String(i.lead?.name || "").trim(), email = norm(i.lead?.email), phone = String(i.lead?.phone || "").trim();
  if (!name3 || name3.length > 120) throw new Error("Name required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid email is required");
  if (!Array.isArray(i.tickets) || !i.tickets.length || i.tickets.length > 20) throw new Error("Choose ticket quantities");
  let seats = 0;
  const tickets = [];
  for (const c of i.tickets) {
    if (!Number.isSafeInteger(c.qty) || c.qty < 1 || c.qty > 100) throw new Error("Invalid quantity");
    const t = await tx.ticketType.findFirst({ where: { id: String(c.id), tourId: d.tourId, active: true } });
    if (!t) throw new Error("Ticket not offered on this tour");
    seats += t.countsTowardCapacity ? t.seatsUsed * c.qty : 0;
    tickets.push({ id: t.id, qty: c.qty });
  }
  if (!seats) throw new Error("Choose at least one ticket that takes a seat");
  if (seats > d.capacity) throw new Error("This party is larger than the departure");
  if (seats <= o.remaining) throw new Error("Seats are available on this departure. Book them instead of joining the waitlist");
  if (await tx.waitlistEntry.findFirst({ where: { departureId: d.id, guestEmail: email, status: { in: LIVE } }, select: { id: true } })) throw new Error("This email is already on the waitlist for this departure");
  const e = await tx.waitlistEntry.create({ data: { departureId: d.id, guestName: name3, guestEmail: email, guestPhone: phone, seats, tickets, source, status: "waiting", note: String(i.note || "").slice(0, 500) } });
  await audit(tx, actorId, "waitlist.joined", "WaitlistEntry", e.id, null, { departureId: d.id, seats, source });
  const waiting = await tx.waitlistEntry.findMany({ where: { departureId: d.id, status: "waiting" }, select: { id: true, seats: true, createdAt: true } });
  return { entryId: e.id, link: linkFor(e.id), position: positionOf(e.id, waiting), seats };
}
async function joinWaitlist(_r, args, context) {
  try {
    const i = args.input || {};
    return await command(context, args.idempotencyKey, "joinWaitlist", i, [`departure:${i.departureId}`], (tx) => joinInTx(tx, i, "online", context.session?.itemId || null));
  } catch (e) {
    throw userFacingError(e);
  }
}
async function addToWaitlist(_r, args, context) {
  try {
    const user = await authorize(context, "canManageBookings");
    const i = args.input || {};
    return await command(context, args.idempotencyKey, "addToWaitlist", i, [`departure:${i.departureId}`], (tx) => joinInTx(tx, i, "phone", user.id));
  } catch (e) {
    throw userFacingError(e);
  }
}
async function view(db, e) {
  const d = await db.departure.findUnique({ where: { id: e.departureId }, include: { tour: true } });
  const waiting = e.status === "waiting" ? await db.waitlistEntry.findMany({ where: { departureId: e.departureId, status: "waiting" }, select: { id: true, seats: true, createdAt: true } }) : [];
  const lapsed = e.status === "offered" && e.offerExpiresAt && e.offerExpiresAt <= /* @__PURE__ */ new Date();
  return {
    entryId: e.id,
    status: lapsed ? "expired" : e.status,
    guestName: e.guestName,
    seats: e.seats,
    tourName: d.tour.name,
    tourSlug: d.tour.slug,
    startAt: d.startAt,
    timezone: d.tour.timezone,
    position: e.status === "waiting" ? positionOf(e.id, waiting) : null,
    offerExpiresAt: lapsed ? null : e.offerExpiresAt,
    bookingRef: e.bookingRef || null,
    note: e.note || ""
  };
}
async function waitlistStatus(_r, args, context) {
  try {
    assertWaitlistProof(String(args.entryId || ""), args.token);
    const e = await context.prisma.waitlistEntry.findUnique({ where: { id: String(args.entryId) } });
    if (!e) throw new Error("Waitlist entry not found");
    return await view(context.prisma, e);
  } catch (e) {
    throw userFacingError(e);
  }
}
async function claimWaitlistOffer(_r, args, context) {
  try {
    const entryId = String(args.entryId || "");
    assertWaitlistProof(entryId, args.token);
    const cart = String(args.cartToken || "");
    if (cart.length < 32 || cart.length > 256) throw new Error("Guest proof must contain 32\u2013256 characters");
    const probe = await context.prisma.waitlistEntry.findUnique({ where: { id: entryId }, select: { departureId: true } });
    if (!probe) throw new Error("Waitlist entry not found");
    return await context.prisma.$transaction(async (tx) => {
      await lockTransactionKey(tx, `departure:${probe.departureId}`);
      const e = await tx.waitlistEntry.findUnique({ where: { id: entryId } });
      if (e.status === "converted") throw new Error(`Already booked as ${e.bookingRef}`);
      if (e.status !== "offered" || !e.offerExpiresAt || e.offerExpiresAt <= /* @__PURE__ */ new Date()) throw new Error("There is no open offer for this waitlist entry");
      const hold = await tx.inventoryHold.findUnique({ where: { id: e.offerHoldId } });
      if (!hold || hold.status !== "active" || hold.expiresAt <= /* @__PURE__ */ new Date()) throw new Error("There is no open offer for this waitlist entry");
      await tx.inventoryHold.update({ where: { id: hold.id }, data: { cartTokenHash: hashToken(cart) } });
      await audit(tx, null, "waitlist.offer_claimed", "WaitlistEntry", e.id, null, { holdId: hold.id });
      return { holdId: hold.id, offerExpiresAt: e.offerExpiresAt };
    }, { timeout: 2e4 });
  } catch (e) {
    throw userFacingError(e);
  }
}
async function withdrawInTx(tx, entryId, actorId, reason) {
  const e = await tx.waitlistEntry.findUnique({ where: { id: entryId } });
  if (!e) throw new Error("Waitlist entry not found");
  if (!LIVE.includes(e.status)) throw new Error(e.status === "converted" ? `Already booked as ${e.bookingRef}` : "This waitlist entry is already closed");
  if (e.offerHoldId) {
    const hold = await tx.inventoryHold.findUnique({ where: { id: e.offerHoldId } });
    if (hold?.status === "active") {
      if (await tx.booking.findFirst({ where: { holdId: hold.id, status: { not: "cancelled" } }, select: { id: true } })) throw new Error("Checkout has started on this offer; finish or abandon it first");
      await tx.inventoryHold.update({ where: { id: hold.id }, data: { status: "released" } });
    }
  }
  await tx.waitlistEntry.update({ where: { id: e.id }, data: { status: "withdrawn", note: reason } });
  await audit(tx, actorId, "waitlist.withdrawn", "WaitlistEntry", e.id, { status: e.status }, { status: "withdrawn" }, reason);
  const next = await promoteWaitlist(tx, e.departureId, actorId);
  return { entryId: e.id, status: "withdrawn", nextOffered: next.offered };
}
async function leaveWaitlist(_r, args, context) {
  try {
    const entryId = String(args.entryId || "");
    assertWaitlistProof(entryId, args.token);
    const probe = await context.prisma.waitlistEntry.findUnique({ where: { id: entryId }, select: { departureId: true } });
    if (!probe) throw new Error("Waitlist entry not found");
    return await command(context, args.idempotencyKey, "leaveWaitlist", { entryId }, [`departure:${probe.departureId}`], (tx) => withdrawInTx(tx, entryId, null, "Guest left the waitlist"));
  } catch (e) {
    throw userFacingError(e);
  }
}
async function withdrawWaitlistEntry(_r, args, context) {
  try {
    const user = await authorize(context, "canManageBookings");
    const i = args.input || {};
    const reason = String(i.reason || "").trim();
    if (!reason) throw new Error("A reason is required");
    const probe = await context.prisma.waitlistEntry.findUnique({ where: { id: String(i.entryId || "") }, select: { departureId: true } });
    if (!probe) throw new Error("Waitlist entry not found");
    return await command(context, args.idempotencyKey, "withdrawWaitlistEntry", { entryId: i.entryId, reason }, [`departure:${probe.departureId}`], (tx) => withdrawInTx(tx, String(i.entryId), user.id, reason));
  } catch (e) {
    throw userFacingError(e);
  }
}
async function bookWaitlistOffer(_r, args, context) {
  try {
    const user = await authorize(context, "canManageBookings");
    const i = args.input || {};
    const names = (Array.isArray(i.participants) ? i.participants : []).map((n) => String(n || "").trim()).filter(Boolean);
    const probe = await context.prisma.waitlistEntry.findUnique({ where: { id: String(i.entryId || "") }, select: { departureId: true } });
    if (!probe) throw new Error("Waitlist entry not found");
    return await command(context, args.idempotencyKey, "bookWaitlistOffer", { entryId: i.entryId, names }, [`departure:${probe.departureId}`], async (tx) => {
      const e = await tx.waitlistEntry.findUnique({ where: { id: String(i.entryId) } });
      if (e.status !== "offered" || !e.offerExpiresAt || e.offerExpiresAt <= /* @__PURE__ */ new Date()) throw new Error("There is no open offer for this waitlist entry");
      const hold = await tx.inventoryHold.findUnique({ where: { id: e.offerHoldId } });
      if (!hold || hold.status !== "active" || hold.expiresAt <= /* @__PURE__ */ new Date()) throw new Error("There is no open offer for this waitlist entry");
      if (await tx.booking.findFirst({ where: { holdId: hold.id }, select: { id: true } })) throw new Error("The guest has started checkout on this offer");
      const quote = { ...hold.quote, departureId: hold.departureId };
      const slots = quote.lines.filter((l) => l.kind === "ticket").flatMap((l) => Array.from({ length: l.qty }, () => l));
      if (names.length !== slots.length) throw new Error(`Enter ${slots.length} participant name${slots.length === 1 ? "" : "s"}, one per ticket`);
      const participants = slots.map((l, n) => ({ fullName: names[n].slice(0, 120), age: null, email: "", dietary: "", medicalNotes: "", snapshot: { ticketTypeId: l.catalogId, name: l.name, unitPriceCents: l.unitPriceCents } }));
      const booking = await newBooking(tx, { quote, lead: { name: e.guestName, email: e.guestEmail, phone: e.guestPhone }, participants, source: "phone", holdId: hold.id, status: "pending_payment" });
      const done = await confirmBooking(tx, booking.id, user.id, args.idempotencyKey);
      if (!done) throw new Error("The held seats are no longer available");
      if (booking.totalCents > 0) await tx.payment.create({ data: { idempotencyKey: `tour-payment:${booking.id}`, amount: booking.totalCents, currencyCode: booking.currencyCode, status: "succeeded", paymentMethod: "cash", orderId: booking.id, processedAt: /* @__PURE__ */ new Date(), processedById: user.id, notes: "Collected by operator (waitlist offer)" } });
      await audit(tx, user.id, "waitlist.booked", "WaitlistEntry", e.id, { status: "offered" }, { status: "converted", bookingRef: booking.bookingRef, totalCents: booking.totalCents });
      return { bookingRef: booking.bookingRef, totalCents: booking.totalCents, currencyCode: booking.currencyCode };
    });
  } catch (e) {
    throw userFacingError(e);
  }
}
async function waitlistBoard(_r, args, context) {
  await authorize(context, "canManageBookings");
  const db = context.prisma, all = args.status === "all";
  const rows = await db.waitlistEntry.findMany({ where: { ...all ? {} : { status: { in: LIVE } }, departure: { startAt: { gt: new Date(Date.now() - (all ? 7 * 864e5 : 0)) } } }, orderBy: [{ createdAt: "asc" }], take: 200 });
  const depIds = [...new Set(rows.map((r) => r.departureId))];
  const deps = depIds.length ? await db.departure.findMany({ where: { id: { in: depIds } }, select: { id: true, startAt: true, capacity: true, status: true, tour: { select: { name: true, timezone: true } } } }) : [];
  const byDep = new Map(deps.map((d) => [d.id, d]));
  const waitingBy = /* @__PURE__ */ new Map();
  for (const r of rows) if (r.status === "waiting") waitingBy.set(r.departureId, [...waitingBy.get(r.departureId) || [], r]);
  const out = rows.map((r) => {
    const d = byDep.get(r.departureId);
    const lapsed = r.status === "offered" && r.offerExpiresAt && r.offerExpiresAt <= /* @__PURE__ */ new Date();
    return {
      id: r.id,
      status: lapsed ? "expired" : r.status,
      guestName: r.guestName,
      guestEmail: r.guestEmail,
      guestPhone: r.guestPhone,
      seats: r.seats,
      source: r.source,
      createdAt: r.createdAt,
      position: r.status === "waiting" ? positionOf(r.id, waitingBy.get(r.departureId) || []) : null,
      offerExpiresAt: lapsed ? null : r.offerExpiresAt,
      bookingRef: r.bookingRef || null,
      note: r.note || "",
      link: LIVE.includes(r.status) ? linkFor(r.id) : null,
      departureId: r.departureId,
      startAt: d?.startAt,
      tourName: d?.tour?.name || "",
      departureStatus: d?.status || ""
    };
  });
  return out.sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt) || (a.position ?? 0) - (b.position ?? 0));
}

// features/keystone/lib/tour-tender.ts
function allocateRefund(tenders, amount) {
  minor(amount);
  const ordered = [...tenders].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt) || b.id.localeCompare(a.id));
  const legs = [];
  let left = amount;
  for (const t of ordered) {
    if (left <= 0) break;
    const room = minor(t.amount) - minor(t.refundedAmount || 0);
    if (room <= 0) continue;
    const take = Math.min(room, left);
    legs.push({ paymentId: t.id, amount: take });
    left -= take;
  }
  if (left > 0) throw new Error("Refund exceeds captured amount");
  return legs;
}
var legKey = (key, index) => index === 0 ? key : `${key}~${index}`;
var legWhere = (key) => ({ OR: [{ idempotencyKey: key }, { idempotencyKey: { startsWith: `${key}~` } }] });

// features/keystone/mutations/tour-gift-cards.ts
var import_node_crypto6 = require("node:crypto");

// features/keystone/lib/tour-gift-card.ts
var CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
function codeFromBytes(bytes) {
  if (bytes.length < 12) throw new Error("Need 12 bytes for a gift card code");
  return Array.from(bytes.slice(0, 12), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}
var formatCode = (raw) => `GC-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
function normalizeCode(input) {
  let s = String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length === 14 && s.startsWith("GC")) s = s.slice(2);
  return s.length === 12 && [...s].every((c) => CODE_ALPHABET.includes(c)) ? s : "";
}
function unusable(card, currencyCode, now = /* @__PURE__ */ new Date()) {
  if (!card) return "Gift card not found";
  if (card.status !== "active") return "This gift card is no longer valid";
  if (card.expiresAt && new Date(card.expiresAt) <= now) return "This gift card has expired";
  if (card.currencyCode !== currencyCode) return `This gift card is in ${card.currencyCode}`;
  if (minor(card.balanceCents) <= 0) return "This gift card has no balance left";
  return null;
}
function applyCard(balanceCents, totalCents) {
  const giftCents = Math.min(minor(balanceCents), minor(totalCents));
  return { giftCents, cardCents: totalCents - giftCents };
}
function issueAmount(cents) {
  if (!Number.isSafeInteger(cents) || cents < 100) throw new Error("Gift card amount must be at least 1.00");
  if (cents > 2e5) throw new Error("Gift card amount must be at most 2,000.00");
  return cents;
}

// features/keystone/mutations/tour-gift-cards.ts
var giftCardCode = (id) => formatCode(codeFromBytes(Buffer.from(derivedToken("giftcard", id), "base64url")));
async function findCardByCode(db, code) {
  const raw = normalizeCode(code);
  return raw ? db.giftCard.findUnique({ where: { codeHash: hashToken(formatCode(raw)) } }) : null;
}
async function debitCard(tx, a) {
  const done = await tx.giftCardEntry.findUnique({ where: { idempotencyKey: a.key } });
  if (done) return done;
  const card = await tx.giftCard.findUnique({ where: { id: a.cardId } });
  const why = unusable(card, a.currencyCode);
  if (why) throw new Error(why);
  if (card.balanceCents < a.amount) throw new Error("The gift card balance changed; it no longer covers this amount");
  const balanceAfterCents = card.balanceCents - a.amount;
  await tx.giftCard.update({ where: { id: card.id }, data: { balanceCents: balanceAfterCents } });
  const entry = await tx.giftCardEntry.create({ data: { giftCardId: card.id, kind: "redeem", amountCents: -a.amount, balanceAfterCents, bookingId: a.booking.id, bookingRef: a.booking.bookingRef, paymentId: a.paymentId, idempotencyKey: a.key, reason: "Booking payment", actorId: a.actorId || "" } });
  await audit(tx, a.actorId, "giftcard.redeemed", "GiftCard", card.id, { balanceCents: card.balanceCents }, { balanceCents: balanceAfterCents, bookingRef: a.booking.bookingRef }, "", a.key);
  return entry;
}
async function returnToCard(tx, a) {
  await lockTransactionKey(tx, `giftcard:${a.cardId}`);
  if (await tx.giftCardEntry.findUnique({ where: { idempotencyKey: a.key } })) return;
  const card = await tx.giftCard.findUnique({ where: { id: a.cardId } });
  const balanceAfterCents = card.balanceCents + a.amount;
  await tx.giftCard.update({ where: { id: card.id }, data: { balanceCents: balanceAfterCents } });
  await tx.giftCardEntry.create({ data: { giftCardId: card.id, kind: "return", amountCents: a.amount, balanceAfterCents, bookingId: a.booking.id, bookingRef: a.booking.bookingRef, paymentId: a.paymentId, idempotencyKey: a.key, reason: a.reason || "Refund", actorId: a.actorId || "" } });
  const stuck = card.status !== "active" || card.expiresAt && card.expiresAt <= /* @__PURE__ */ new Date();
  await audit(tx, a.actorId, stuck ? "giftcard.returned_to_unusable_card" : "giftcard.returned", "GiftCard", card.id, { balanceCents: card.balanceCents }, { balanceCents: balanceAfterCents, bookingRef: a.booking.bookingRef }, stuck ? "Card is void or expired: reissue the value" : a.reason, a.key);
}
var view2 = (c, entries) => ({
  id: c.id,
  last4: c.last4,
  status: c.expiresAt && c.expiresAt <= /* @__PURE__ */ new Date() && c.status === "active" ? "expired" : c.status,
  initialCents: c.initialCents,
  balanceCents: c.balanceCents,
  currencyCode: c.currencyCode,
  expiresAt: c.expiresAt,
  fundedBy: c.fundedBy,
  recipientName: c.recipientName,
  recipientEmail: c.recipientEmail,
  note: c.note,
  createdAt: c.createdAt,
  ...entries ? { entries: entries.map((e) => ({ kind: e.kind, amountCents: e.amountCents, balanceAfterCents: e.balanceAfterCents, bookingRef: e.bookingRef, reason: e.reason, createdAt: e.createdAt })) } : {}
});
async function issueGiftCard(_r, args, context) {
  const user = await authorize(context, "canManagePayments");
  const i = args.input || {};
  const amount = issueAmount(Number(i.amountCents));
  const fundedBy = i.fundedBy === "complimentary" ? "complimentary" : "cash";
  const recipientName = String(i.recipientName || "").trim(), recipientEmail = String(i.recipientEmail || "").trim().toLowerCase();
  if (recipientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) throw userFacingError(new Error("Recipient email is not valid"));
  const expiresAt = i.expiresAt ? new Date(i.expiresAt) : null;
  if (expiresAt && !(expiresAt.getTime() > Date.now() + 864e5)) throw userFacingError(new Error("Expiry must be at least a day from now"));
  if (fundedBy === "complimentary" && !String(i.note || "").trim()) throw userFacingError(new Error("Say why this voucher is complimentary"));
  const settings = await context.prisma.storeSettings.findFirst({ select: { currencyCode: true } });
  const id = "c" + (0, import_node_crypto6.randomBytes)(12).toString("hex");
  const params = { amount, fundedBy, recipientName, recipientEmail, expiresAt: expiresAt?.toISOString() || null, note: String(i.note || "").trim() };
  const card = await command(context, args.idempotencyKey, "issueGiftCard", params, [`giftcard:${id}`], async (tx) => {
    const code = giftCardCode(id);
    const c2 = await tx.giftCard.create({ data: { id, codeHash: hashToken(code), last4: code.slice(-4), status: "active", initialCents: amount, balanceCents: amount, currencyCode: settings?.currencyCode || "USD", expiresAt, fundedBy, recipientName, recipientEmail, note: params.note, issuedById: user.id } });
    await tx.giftCardEntry.create({ data: { giftCardId: c2.id, kind: "issue", amountCents: amount, balanceAfterCents: amount, idempotencyKey: `gift-issue:${c2.id}`, reason: fundedBy === "cash" ? "Sold for cash" : `Complimentary: ${params.note}`, actorId: user.id } });
    await audit(tx, user.id, "giftcard.issued", "GiftCard", c2.id, null, { amountCents: amount, fundedBy, currencyCode: c2.currencyCode, last4: c2.last4 }, params.note, args.idempotencyKey);
    return { id: c2.id };
  });
  const c = await context.prisma.giftCard.findUnique({ where: { id: card.id } });
  return { ...view2(c), code: giftCardCode(c.id) };
}
async function revealGiftCardCode(_r, args, context) {
  const user = await authorize(context, "canManagePayments");
  const c = await context.prisma.giftCard.findUnique({ where: { id: String(args.id || "") } });
  if (!c) throw userFacingError(new Error("Gift card not found"));
  await context.prisma.$transaction((tx) => audit(tx, user.id, "giftcard.code_shown", "GiftCard", c.id, null, null, ""));
  return { id: c.id, code: giftCardCode(c.id) };
}
async function voidGiftCard(_r, args, context) {
  const user = await authorize(context, "canManagePayments");
  const i = args.input || {};
  const reason = String(i.reason || "").trim();
  if (!reason) throw userFacingError(new Error("Reason required"));
  await command(context, args.idempotencyKey, "voidGiftCard", { id: i.id, reason }, [`giftcard:${i.id}`], async (tx) => {
    const c = await tx.giftCard.findUnique({ where: { id: String(i.id || "") } });
    if (!c) throw new Error("Gift card not found");
    if (c.status === "void") return { id: c.id };
    await tx.giftCard.update({ where: { id: c.id }, data: { status: "void", balanceCents: 0 } });
    await tx.giftCardEntry.create({ data: { giftCardId: c.id, kind: "void", amountCents: -c.balanceCents, balanceAfterCents: 0, idempotencyKey: `gift-void:${c.id}`, reason, actorId: user.id } });
    await audit(tx, user.id, "giftcard.voided", "GiftCard", c.id, { status: c.status, balanceCents: c.balanceCents }, { status: "void", balanceCents: 0 }, reason, args.idempotencyKey);
    return { id: c.id };
  });
  return view2(await context.prisma.giftCard.findUnique({ where: { id: i.id } }));
}
async function giftCardBoard(_r, args, context) {
  await authorize(context, "canManagePayments");
  const q = String(args.search || "").trim();
  const byCode = q ? await findCardByCode(context.prisma, q) : null;
  const where = byCode ? { id: byCode.id } : q ? { OR: [{ last4: q.toUpperCase() }, { recipientName: { contains: q, mode: "insensitive" } }, { recipientEmail: { contains: q.toLowerCase() } }] } : {};
  const [cards, outstanding] = await Promise.all([
    context.prisma.giftCard.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, include: { entries: { orderBy: { createdAt: "asc" } } } }),
    // Outstanding = every balance still owed, including value a refund returned to a card after it was voided or expired (to reissue).
    context.prisma.giftCard.aggregate({ where: { balanceCents: { gt: 0 } }, _sum: { balanceCents: true }, _count: true })
  ]);
  return { cards: cards.map((c) => view2(c, c.entries)), outstandingCents: outstanding._sum.balanceCents || 0, activeCards: outstanding._count };
}
async function giftCardBalance(_r, args, context) {
  const c = await findCardByCode(context.prisma, args.code);
  const settings = await context.prisma.storeSettings.findFirst({ select: { currencyCode: true } });
  const why = unusable(c, c?.currencyCode || settings?.currencyCode || "USD");
  if (why) throw userFacingError(new Error(why === "This gift card is no longer valid" ? "Gift card not found" : why));
  return { last4: c.last4, balanceCents: c.balanceCents, currencyCode: c.currencyCode, expiresAt: c.expiresAt };
}

// features/keystone/lib/stateMachines.ts
var MACHINES = {
  // scheduled has no writer (departures are created on_sale); in_progress has no writer either (closeDeparture accepts it for imports).
  departure: {
    scheduled: ["on_sale", "confirmed", "full", "min_not_met", "closed", "cancelled", "weather_cancelled"],
    on_sale: ["confirmed", "full", "min_not_met", "closed", "cancelled", "weather_cancelled"],
    min_not_met: ["on_sale", "confirmed", "full", "closed", "cancelled", "weather_cancelled"],
    confirmed: ["on_sale", "full", "min_not_met", "closed", "cancelled", "weather_cancelled"],
    full: ["on_sale", "confirmed", "min_not_met", "closed", "cancelled", "weather_cancelled"],
    closed: ["in_progress", "completed", "cancelled", "weather_cancelled"],
    in_progress: ["completed"],
    completed: [],
    cancelled: [],
    weather_cancelled: []
  },
  // cancelled -> pending_payment: a payment that lands after its hold lapsed revives the booking if the seats are still free.
  // partially_refunded is legacy: a partial refund now leaves the operational status alone (refundedCents records it).
  booking: {
    pending_payment: ["confirmed", "cancelled"],
    confirmed: ["checked_in", "no_show", "cancelled", "refunded", "partially_refunded"],
    checked_in: ["completed", "cancelled", "refunded", "partially_refunded"],
    // no_show -> confirmed: undoNoShow at the office when the guest did arrive.
    no_show: ["confirmed", "cancelled", "refunded"],
    completed: ["cancelled", "refunded", "partially_refunded"],
    partially_refunded: ["checked_in", "no_show", "completed", "cancelled", "refunded"],
    refunded: [],
    // cancelled -> refunded: seats were lost after a card payment and the whole payment was refunded.
    cancelled: ["pending_payment", "refunded"]
  },
  inventoryHold: { active: ["converted", "released", "expired"], converted: [], released: [], expired: [] },
  partyChange: { pending_payment: ["applied", "cancelled", "failed"], cancelled: ["applied", "failed"], applied: [], failed: [] },
  waitlistEntry: { waiting: ["offered", "withdrawn", "expired"], offered: ["converted", "expired", "withdrawn"], converted: [], expired: [], withdrawn: [] },
  promoRedemption: { reserved: ["committed", "released"], committed: ["released"], released: [] },
  guideAssignment: { offered: ["accepted", "declined", "cancelled"], accepted: ["worked", "cancelled"], worked: [], declined: [], cancelled: [] },
  guidePayout: { draft: ["approved"], approved: ["paid"], paid: [] },
  channelStatement: { open: ["invoiced"], invoiced: ["paid"], paid: [] },
  giftCard: { active: ["void"], void: [] },
  // reopened when a departure that had resolved its decision drops below the minimum again.
  operationalTask: { open: ["resolved"], resolved: ["open"] },
  participantCheckIn: { pending: ["checked_in", "no_show"], checked_in: [], no_show: [] },
  waiver: { required: ["signed"], signed: [], not_required: [] },
  refund: { processing: ["succeeded", "failed", "unknown"], unknown: ["succeeded", "failed", "unknown"], succeeded: [], failed: [] },
  payment: { pending: ["processing", "succeeded", "failed", "cancelled", "unknown"], processing: ["authorized", "succeeded", "failed", "cancelled", "unknown"], authorized: ["succeeded", "failed", "cancelled"], unknown: ["succeeded", "failed", "cancelled"], succeeded: ["partially_refunded", "refunded"], partially_refunded: ["partially_refunded", "refunded"], refunded: [], failed: [], cancelled: [] },
  managerApproval: { pending: ["approved", "rejected", "expired"], approved: ["consumed", "expired"], rejected: [], consumed: [], expired: [] },
  paymentWebhookEvent: { received: ["processed", "ignored", "failed"], failed: ["processed", "ignored", "failed"], processed: [], ignored: [] }
};
var canTransition = (m, from, to) => MACHINES[m][from]?.includes(to) ?? false;
function assertMove(m, from, to) {
  if (!canTransition(m, from, to)) throw new Error(`A ${m.replace(/([A-Z])/g, " $1").toLowerCase()} cannot move from ${from.replace(/_/g, " ")} to ${to.replace(/_/g, " ")}`);
}

// features/keystone/utils/managerApproval.ts
function normalizedRequest(input) {
  return canonicalIdempotencyParams({
    actionType: input.actionType,
    targetId: input.targetId,
    reason: input.reason.trim(),
    amount: input.amount ?? null
  });
}
function canRequestAction(context, actionType) {
  return permissions.canIssueRefunds({ session: context.session });
}
async function requestManagerApproval(_root, input, context) {
  const requesterId = context.session?.itemId;
  if (!requesterId || !canRequestAction(context, input.actionType)) {
    throw new Error("Not authorized to request this manager approval");
  }
  if (!input.targetId?.trim()) throw new Error("Approval target is required");
  if (!input.reason?.trim()) throw new Error("Approval reason is required");
  const requestPayload = normalizedRequest(input);
  return context.prisma.managerApproval.create({
    data: {
      actionType: input.actionType,
      targetId: input.targetId.trim(),
      reason: input.reason.trim(),
      amount: input.amount ?? null,
      requestPayload,
      requestFingerprint: idempotencyFingerprint(requestPayload),
      status: "pending",
      requestedById: requesterId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1e3)
    }
  });
}
async function approveManagerApproval(_root, { approvalId }, context) {
  const approverId = context.session?.itemId;
  if (!approverId) throw new Error("Not authorized to approve manager actions");
  const prisma = context.prisma;
  const outcome = await prisma.$transaction(async (tx) => {
    const approval = await tx.managerApproval.findUnique({ where: { id: approvalId } });
    if (!approval) throw new Error("Manager approval request not found");
    if (!(canRequestAction(context, approval.actionType) && permissions.canIssueRefunds({ session: context.session }))) {
      throw new Error("Not authorized to approve this manager action");
    }
    if (approval.requestedById === approverId) {
      throw new Error("A manager cannot approve their own correction request");
    }
    if (approval.status !== "pending") throw new Error(`Manager approval is already ${approval.status}`);
    if (new Date(approval.expiresAt) <= /* @__PURE__ */ new Date()) {
      const expired = await tx.managerApproval.update({ where: { id: approval.id }, data: { status: "expired" } });
      return { expired };
    }
    const updated = await tx.managerApproval.updateMany({
      where: { id: approval.id, status: "pending", requestedById: { not: approverId } },
      data: { status: "approved", approvedById: approverId, approvedAt: /* @__PURE__ */ new Date() }
    });
    if (updated.count !== 1) throw new Error("Manager approval changed concurrently");
    return { approval: await tx.managerApproval.findUnique({ where: { id: approval.id } }) };
  }, { isolationLevel: "Serializable" });
  if (outcome.expired) throw new Error("Manager approval request has expired");
  return outcome.approval;
}
async function consumeManagerApproval(tx, input) {
  if (!input.approvalId) throw new Error("Independent manager approval is required");
  if (!input.actorId) throw new Error("Authenticated correction actor is required");
  const approval = await tx.managerApproval.findUnique({ where: { id: input.approvalId } });
  if (!approval) throw new Error("Manager approval request not found");
  const requestPayload = normalizedRequest(input);
  if (approval.requestFingerprint !== idempotencyFingerprint(approval.requestPayload || {}) || approval.requestFingerprint !== idempotencyFingerprint(requestPayload) || approval.requestedById !== input.actorId) {
    throw new Error("Manager approval does not match this correction request");
  }
  if (!approval.approvedById || approval.approvedById === input.actorId) {
    throw new Error("Correction requires approval by a different manager");
  }
  if (approval.status !== "approved") throw new Error(`Manager approval is ${approval.status}`);
  if (new Date(approval.expiresAt) <= /* @__PURE__ */ new Date()) throw new Error("Manager approval has expired");
  const consumed = await tx.managerApproval.updateMany({
    where: {
      id: approval.id,
      status: "approved",
      requestedById: input.actorId,
      approvedById: { not: input.actorId },
      expiresAt: { gt: /* @__PURE__ */ new Date() }
    },
    data: {
      status: "consumed",
      consumedAt: /* @__PURE__ */ new Date(),
      consumedEntityType: input.entityType,
      consumedEntityId: input.entityId
    }
  });
  if (consumed.count !== 1) throw new Error("Manager approval was already consumed or expired");
  return approval;
}

// features/keystone/mutations/tour-checkout.ts
var LIVE2 = ["confirmed", "checked_in", "completed", "no_show", "partially_refunded", "refunded"];
var norm2 = (s) => String(s || "").trim().toLowerCase();
async function provider(prisma) {
  const p2 = await prisma.paymentProvider.findFirst({ where: { code: "pp_stripe", isInstalled: true } });
  if (!p2) throw new Error("Payment provider is not configured");
  return p2;
}
async function refreshDepartureStatus(tx, departureId) {
  const o = await departureOccupancy(tx, departureId);
  const d = o.departure;
  if (!["scheduled", "on_sale", "min_not_met", "confirmed", "full"].includes(d.status)) return;
  const next = o.booked >= d.capacity ? "full" : o.booked >= d.tour.minParticipants ? "confirmed" : d.status === "min_not_met" ? "min_not_met" : "on_sale";
  if (next !== d.status) await tx.departure.update({ where: { id: d.id }, data: { status: next } });
  if (next === "confirmed" || next === "full") await tx.operationalTask.updateMany({ where: { taskKey: `min:${d.id}`, status: "open" }, data: { status: "resolved" } });
}
function buildParticipants(quote, input) {
  const tickets = quote.lines.filter((l) => l.kind === "ticket");
  const total = tickets.reduce((n, l) => n + l.qty, 0);
  if (!Array.isArray(input) || input.length !== total) throw new Error("Provide one participant per ticket");
  const remaining = new Map(tickets.map((l) => [l.catalogId, l.qty]));
  return input.map((p2) => {
    const line = tickets.find((l) => l.catalogId === p2.ticketTypeId);
    if (!line || !(remaining.get(line.catalogId) > 0)) throw new Error("Participants do not match selected tickets");
    remaining.set(line.catalogId, remaining.get(line.catalogId) - 1);
    const name3 = String(p2.fullName || "").trim();
    if (!name3 || name3.length > 120) throw new Error("Participant name required");
    if (p2.age !== void 0 && p2.age !== null && (line.minAge != null && p2.age < line.minAge || line.maxAge != null && p2.age > line.maxAge)) throw new Error(`${name3} does not meet the age range for ${line.name}`);
    return { fullName: name3, age: p2.age ?? null, email: String(p2.email || "").trim(), dietary: String(p2.dietary || ""), medicalNotes: String(p2.medicalNotes || ""), snapshot: { ticketTypeId: line.catalogId, name: line.name, unitPriceCents: line.unitPriceCents } };
  });
}
async function newBooking(tx, a) {
  const q = a.quote;
  const commission = a.channel ? basisPoints(q.totalCents, a.channel.commissionBps) : 0;
  let bookingRef = "";
  for (let i = 0; i < 5; i++) {
    bookingRef = `TG-${humanCode(8)}`;
    if (!await tx.booking.findUnique({ where: { bookingRef } })) break;
  }
  const booking = await tx.booking.create({ data: {
    bookingRef,
    departureId: q.departureId,
    customerId: a.customerId || void 0,
    guestName: String(a.lead.name || "").trim(),
    guestEmail: norm2(a.lead.email),
    guestPhone: String(a.lead.phone || ""),
    status: a.status,
    channelId: a.channel?.id,
    source: a.source,
    subtotalCents: q.subtotalCents,
    addOnsCents: q.addOnsCents,
    discountCents: q.discountCents,
    taxCents: q.taxCents,
    totalCents: q.totalCents,
    channelCommissionCents: commission,
    currencyCode: q.currencyCode,
    seats: 0,
    policySnapshot: q.policy,
    tourSnapshot: { ...q.tour, promo: q.promo },
    holdId: a.holdId,
    specialRequests: String(a.lead.specialRequests || ""),
    pickupLocation: String(a.lead.pickupLocation || ""),
    lines: { create: q.lines.map((l) => ({ name: l.name, unitPriceCents: l.unitPriceCents, qty: l.qty, seatsUsed: l.seatsUsed, kind: l.kind, totalCents: l.unitPriceCents * l.qty, currencyCode: q.currencyCode, catalogId: l.catalogId })) }
  } });
  if (!booking.guestName || !booking.guestEmail.includes("@")) throw new Error("Lead booker name and email required");
  for (const p2 of a.participants) {
    const row = await tx.participant.create({ data: { bookingId: booking.id, fullName: p2.fullName, age: p2.age, email: p2.email, dietary: p2.dietary, medicalNotes: p2.medicalNotes, ticketTypeSnapshot: p2.snapshot, waiverStatus: q.tour.waiverTemplateId ? "required" : "not_required" } });
    if (q.tour.waiverTemplateId) await tx.participant.update({ where: { id: row.id }, data: { waiverTokenHash: hashToken(derivedToken("waiver", row.id)) } });
  }
  return booking;
}
async function queueGuestNotification(tx, kind, booking, trip, actorId) {
  const targetId = `${kind}:${booking.id}`;
  if (await tx.auditEvent.findFirst({ where: { targetList: "Notification", targetId }, select: { id: true } })) return null;
  const email = String(booking.guestEmail || "").trim().toLowerCase();
  const pref = email ? await tx.notificationPreference.findUnique({ where: { email } }) : null;
  const n = notificationAfter(kind, booking, trip, pref);
  await audit(tx, actorId, n.action, "Notification", targetId, null, n.after, n.reason, notificationRequestId(kind, booking.id));
  return n.action;
}
async function queueDayBeforeReminders(tx, actorId, departureIds) {
  let reminders = 0, suppressedReminders = 0;
  const soon = await tx.departure.findMany({ where: { ...departureIds ? { id: { in: departureIds } } : {}, status: { in: ["on_sale", "min_not_met", "confirmed", "full"] }, startAt: { gt: /* @__PURE__ */ new Date(), lt: new Date(Date.now() + REMINDER_WINDOW_MS) } }, include: { tour: true, bookings: { where: { status: "confirmed" } } } });
  for (const d of soon) for (const b of d.bookings) {
    const r = await queueGuestNotification(tx, "day_before_reminder", b, { tourName: d.tour.name, startAt: d.startAt, timezone: d.tour.timezone, meetingPoint: b.tourSnapshot?.meetingPoint }, actorId);
    if (r === "notification.queued") reminders++;
    else if (r) suppressedReminders++;
  }
  return { reminders, suppressedReminders };
}
async function confirmBooking(tx, bookingId, actorId, requestId) {
  const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { hold: true } });
  if (booking.status === "confirmed") return booking;
  const hold = booking.hold;
  const o = await departureOccupancy(tx, booking.departureId, hold?.id, booking.channelId);
  const seats = hold.quantity;
  const lateHold = hold.status !== "active" || hold.expiresAt <= /* @__PURE__ */ new Date();
  if (hold.status === "released" || lateHold && seats > o.remaining) return null;
  await tx.inventoryHold.update({ where: { id: hold.id }, data: { status: "converted" } });
  await tx.booking.update({ where: { id: booking.id }, data: { status: "confirmed", seats } });
  const redemptions = await tx.promoRedemption.findMany({ where: { holdId: hold.id, status: "reserved" } });
  for (const r of redemptions) {
    await tx.promoRedemption.update({ where: { id: r.id }, data: { status: "committed", bookingId: booking.id } });
    await tx.promoCode.update({ where: { id: r.promoCodeId }, data: { usedCount: { increment: 1 } } });
  }
  await markWaitlistConverted(tx, hold.id, booking.bookingRef);
  await refreshDepartureStatus(tx, booking.departureId);
  await audit(tx, actorId, "booking.confirmed", "Booking", booking.id, { status: booking.status }, { status: "confirmed", seats }, "", requestId);
  const snap = booking.tourSnapshot || {};
  await queueGuestNotification(tx, "booking_confirmation", booking, { tourName: snap.name || "your tour", startAt: snap.startAt, timezone: snap.timezone, meetingPoint: snap.meetingPoint }, actorId);
  return tx.booking.findUnique({ where: { id: booking.id } });
}
async function waiverLinks(prisma, bookingId) {
  const ps = await prisma.participant.findMany({ where: { bookingId, waiverStatus: "required" }, select: { id: true, fullName: true } });
  return ps.map((p2) => ({ participantId: p2.id, fullName: p2.fullName, token: derivedToken("waiver", p2.id) }));
}
async function startBookingCheckout(_r, args, context) {
  const i = args.input;
  if (!i.token) throw new Error("Booking not found");
  const hold = await context.prisma.inventoryHold.findUnique({ where: { id: i.holdId } });
  if (!hold) throw new Error("Booking not found");
  assertProof(i.token, hold.cartTokenHash);
  const prov = await provider(context.prisma);
  const gift = i.giftCardCode ? await findCardByCode(context.prisma, i.giftCardCode) : null;
  if (i.giftCardCode) {
    const why = unusable(gift, hold.quote?.currencyCode || "USD");
    if (why) throw userFacingError(new Error(why === "This gift card is no longer valid" ? "Gift card not found" : why));
  }
  const b = await context.prisma.$transaction(async (tx) => {
    await lockTransactionKey(tx, `departure:${hold.departureId}`);
    const h = await tx.inventoryHold.findUnique({ where: { id: hold.id } });
    const existing = await tx.booking.findUnique({ where: { holdId: h.id }, include: { paymentCollection: { include: { paymentSessions: true } } } });
    if (existing) return existing;
    if (h.status !== "active" || h.expiresAt <= /* @__PURE__ */ new Date()) throw new Error("Hold expired; choose seats again");
    const quote = { ...h.quote, departureId: h.departureId };
    const participants = buildParticipants(quote, i.participants);
    const booking = await newBooking(tx, { quote, lead: i.lead, participants, source: "online", holdId: h.id, customerId: context.session?.itemId, status: "pending_payment" });
    await tx.inventoryHold.update({ where: { id: h.id }, data: { expiresAt: new Date(Math.max(h.expiresAt.getTime(), Date.now() + 15 * 6e4)) } });
    const split = gift ? applyCard(gift.balanceCents, quote.totalCents) : { giftCents: 0, cardCents: quote.totalCents };
    const collection = await tx.paymentCollection.create({ data: { amount: quote.totalCents, description: "default" } });
    await tx.booking.update({ where: { id: booking.id }, data: { paymentCollectionId: collection.id } });
    await tx.paymentSession.create({ data: { paymentCollectionId: collection.id, paymentProviderId: prov.id, amount: split.cardCents, isSelected: true, idempotencyKey: (0, import_node_crypto7.createHash)("sha256").update(`tour-checkout:${h.id}`).digest("hex"), data: { state: "initializing", ...gift ? { giftCardId: gift.id, giftCents: split.giftCents, giftLast4: gift.last4 } : {} } } });
    await audit(tx, context.session?.itemId || null, "booking.checkout_started", "Booking", booking.id, null, { totalCents: quote.totalCents }, "", args.idempotencyKey);
    return tx.booking.findUnique({ where: { id: booking.id }, include: { paymentCollection: { include: { paymentSessions: true } } } });
  }, { timeout: 2e4 });
  const session = b.paymentCollection.paymentSessions[0];
  let data = session.data || {};
  const giftCents = data.giftCents || 0, cardCents = b.totalCents - giftCents;
  const shares = { totalCents: b.totalCents, giftCents, cardCents, giftLast4: data.giftLast4 || null, currencyCode: b.currencyCode };
  if (cardCents === 0) return { bookingRef: b.bookingRef, clientSecret: null, publishableKey: null, ...shares };
  if (!data.paymentIntentId) {
    const created = await createPayment({ provider: prov, order: { id: b.id, orderNumber: b.bookingRef }, amount: cardCents, currency: b.currencyCode, idempotencyKey: session.idempotencyKey });
    data = { ...data, state: "ready", paymentIntentId: created.paymentIntentId, clientSecret: created.clientSecret };
    await context.prisma.paymentSession.update({ where: { id: session.id }, data: { isInitiated: true, data } });
  }
  return { bookingRef: b.bookingRef, clientSecret: data.clientSecret, publishableKey: getPublicPaymentProviderConfig(prov.code)?.publishableKey || null, ...shares };
}
async function finalizeBookingPayment(prisma, bookingId, actorId, requestId) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { paymentCollection: { include: { paymentSessions: { include: { paymentProvider: true } } } } } });
  if (!booking) throw new Error("Booking not found");
  const session = booking.paymentCollection?.paymentSessions?.find((s) => s.isSelected);
  const giftCardId = session?.data?.giftCardId || null, giftCents = session?.data?.giftCents || 0;
  const cardCents = booking.totalCents - giftCents;
  let revive = false;
  if (booking.status !== "pending_payment") {
    if (booking.status === "cancelled" && cardCents > 0 && booking.holdId && session?.data?.paymentIntentId) {
      const lapsed = await prisma.inventoryHold.findUnique({ where: { id: booking.holdId }, select: { status: true } });
      revive = lapsed?.status === "expired" && !await prisma.payment.findUnique({ where: { idempotencyKey: `tour-payment:${booking.id}` }, select: { id: true } });
    }
    if (!revive) return booking;
  }
  let observed = null;
  if (cardCents > 0) {
    if (!session?.data?.paymentIntentId) throw new Error("Payment has not started");
    try {
      observed = await getPaymentStatus({ provider: session.paymentProvider, paymentId: session.data.paymentIntentId });
      if (observed.status !== "succeeded") throw new Error("Payment not completed");
    } catch (e) {
      if (revive) return booking;
      throw e;
    }
    if (observed.amount !== cardCents || String(observed.currencyCode).toUpperCase() !== booking.currencyCode) throw new Error("Payment amount does not match the booking; operator reconciliation required");
  }
  let failure = "";
  const confirmed = await prisma.$transaction(async (tx) => {
    await lockTransactionKey(tx, `departure:${booking.departureId}`);
    if (revive) {
      assertMove("booking", "cancelled", "pending_payment");
      const back = await tx.booking.updateMany({ where: { id: booking.id, status: "cancelled" }, data: { status: "pending_payment" } });
      if (back.count !== 1) return booking;
      await audit(tx, actorId, "booking.revived_by_late_payment", "Booking", booking.id, { status: "cancelled" }, { status: "pending_payment" }, "Card payment arrived after the hold lapsed", requestId);
    }
    if (giftCardId) {
      await lockTransactionKey(tx, `giftcard:${giftCardId}`);
      const card = await tx.giftCard.findUnique({ where: { id: giftCardId } });
      const why = unusable(card, booking.currencyCode) || (card.balanceCents < giftCents ? "The gift card balance changed before payment finished" : null);
      if (why) failure = `${why}; ${cardCents > 0 ? "card payment refunded" : "nothing was charged"}`;
    }
    const result = failure ? null : await confirmBooking(tx, booking.id, actorId, requestId);
    if (!result) {
      failure ||= `Seats were no longer available; ${cardCents > 0 ? "payment refunded" : "nothing was charged"}`;
      await tx.booking.update({ where: { id: booking.id }, data: { status: "cancelled" } });
      await tx.inventoryHold.updateMany({ where: { id: booking.holdId, status: "active" }, data: { status: "released" } });
    }
    const paidAt = /* @__PURE__ */ new Date();
    if (cardCents > 0) {
      await tx.payment.create({ data: { createdAt: paidAt, idempotencyKey: `tour-payment:${booking.id}`, amount: cardCents, currencyCode: booking.currencyCode, status: "succeeded", paymentMethod: "credit_card", paymentProviderId: session.paymentProviderId, providerPaymentId: session.data.paymentIntentId, orderId: booking.id, paymentCollectionId: booking.paymentCollectionId, processedAt: /* @__PURE__ */ new Date(), isSplitPayment: giftCents > 0, data: { paymentIntentId: session.data.paymentIntentId } } });
      await tx.paymentCollection.update({ where: { id: booking.paymentCollectionId }, data: { authorizedAmount: result ? booking.totalCents : cardCents } });
      await tx.paymentSession.update({ where: { id: session.id }, data: { paymentAuthorizedAt: /* @__PURE__ */ new Date(), data: { ...session.data, state: "captured" } } });
    }
    if (result && giftCents > 0) {
      const pay = await tx.payment.create({ data: { createdAt: new Date(paidAt.getTime() + 1), idempotencyKey: `tour-gift:${booking.id}`, amount: giftCents, currencyCode: booking.currencyCode, status: "succeeded", paymentMethod: "gift_card", orderId: booking.id, paymentCollectionId: booking.paymentCollectionId, processedAt: /* @__PURE__ */ new Date(), isSplitPayment: cardCents > 0, data: { giftCardId } } });
      await debitCard(tx, { cardId: giftCardId, amount: giftCents, currencyCode: booking.currencyCode, key: `gift-redeem:${booking.id}`, booking, paymentId: pay.id, actorId });
    }
    return result;
  }, { timeout: 2e4 });
  if (failure) {
    if (cardCents > 0) await issueRefund(prisma, { bookingId: booking.id, amount: cardCents, reason: failure, key: `late-pay:${booking.id}`, actorId: null, cancel: true });
    throw new Error(failure);
  }
  return confirmed;
}
async function completeBookingCheckout(_r, args, context) {
  const i = args.input;
  const booking = await context.prisma.booking.findUnique({ where: { bookingRef: String(i.bookingRef) }, include: { hold: true } });
  if (!booking?.hold) throw new Error("Booking not found");
  assertProof(i.token, booking.hold.cartTokenHash);
  const done = await finalizeBookingPayment(context.prisma, booking.id, context.session?.itemId || null, args.idempotencyKey);
  return { bookingRef: done.bookingRef, status: done.status, waivers: await waiverLinks(context.prisma, done.id) };
}
async function bookingView(prisma, booking) {
  const full = await prisma.booking.findUnique({ where: { id: booking.id }, include: { departure: { include: { tour: { include: { meetingPoint: true } } } }, lines: true, participants: { select: { id: true, fullName: true, waiverStatus: true, checkInStatus: true } } } });
  const meeting = full.departure?.tour?.meetingPoint;
  return {
    bookingRef: full.bookingRef,
    manageToken: manageToken(full.id, full.manageTokenVersion),
    status: full.status,
    totalCents: full.totalCents,
    refundedCents: full.refundedCents,
    currencyCode: full.currencyCode,
    seats: full.seats,
    tourName: full.tourSnapshot?.name || full.departure?.tour?.name,
    startAt: full.departure?.startAt,
    endAt: full.departure?.endAt,
    timezone: full.tourSnapshot?.timezone,
    meetingPoint: meeting ? { name: meeting.name, address: meeting.address, instructions: meeting.instructions, mapLink: meeting.mapLink } : full.tourSnapshot?.meetingPoint || null,
    lines: full.lines.map((l) => ({ name: l.name, qty: l.qty, unitPriceCents: l.unitPriceCents, kind: l.kind })),
    participants: full.participants.map((p2) => ({ participantId: p2.id, fullName: p2.fullName, waiverStatus: p2.waiverStatus, checkInStatus: p2.checkInStatus })),
    refundIfCancelledCents: ["confirmed"].includes(full.status) ? refundPolicyAmount(full.totalCents - full.refundedCents, full.policySnapshot?.rules || [], (full.departure.startAt.getTime() - Date.now()) / 36e5) : 0,
    waivers: ["confirmed", "checked_in"].includes(full.status) ? await waiverLinks(prisma, full.id) : []
  };
}
async function lookupBooking(_r, args, context) {
  const booking = await context.prisma.booking.findUnique({ where: { bookingRef: String(args.bookingRef || "").trim().toUpperCase() } });
  if (!booking || norm2(booking.guestEmail) !== norm2(args.email)) throw new Error("Booking not found");
  return bookingView(context.prisma, booking);
}
async function issueRefund(prisma, a) {
  const reservation = await prisma.$transaction(async (tx) => {
    const b = await tx.booking.findUnique({ where: { id: a.bookingId }, select: { departureId: true } });
    await lockTransactionKey(tx, `departure:${b.departureId}`);
    return reserveRefund(tx, a);
  }, { timeout: 2e4 });
  return settleRefund(prisma, a, reservation);
}
async function reserveRefund(tx, a) {
  const existing = await tx.refund.findMany({ where: { orderId: a.bookingId, ...legWhere(a.key) }, orderBy: { createdAt: "asc" } });
  if (existing.length) return { legs: existing, replay: true };
  const live = await tx.booking.findUnique({ where: { id: a.bookingId } });
  const payments = await tx.payment.findMany({ where: { orderId: live.id, status: { in: ["succeeded", "partially_refunded"] } } });
  if (!Number.isSafeInteger(a.amount) || a.amount < 0) throw new Error("Refund exceeds captured amount");
  if (!payments.length) {
    if (a.amount === 0 || live.totalCents === 0 || live.channelId) return { legs: [], replay: false };
    throw new Error("No captured payment to refund");
  }
  if (a.amount === 0) return { legs: [], replay: false };
  const plan = allocateRefund(payments, a.amount);
  let approvedById = null;
  if (a.approvalThresholdCents !== void 0 && a.amount > a.approvalThresholdCents) {
    const approval = await consumeManagerApproval(tx, { actionType: "refund_booking", targetId: live.id, reason: a.reason, amount: a.amount, approvalId: a.approvalId, actorId: a.actorId, entityType: "Booking", entityId: live.id });
    approvedById = approval.approvedById;
  }
  const legs = [];
  for (const [i, leg] of plan.entries()) {
    const payment = payments.find((x) => x.id === leg.paymentId);
    legs.push(await tx.refund.create({ data: { idempotencyKey: legKey(a.key, i), amount: leg.amount, currencyCode: payment.currencyCode, status: "processing", reason: a.reason || "Refund", paymentId: payment.id, orderId: live.id, requestedById: a.requestedById || a.actorId, approvedById } }));
  }
  await audit(tx, a.actorId, "refund.reserved", "Refund", legs[0].id, null, { amount: a.amount, legs: legs.map((l) => ({ id: l.id, paymentId: l.paymentId, amount: l.amount })) }, a.reason, a.key);
  return { legs, replay: false };
}
async function settleRefund(prisma, a, reservation) {
  const legs = reservation.legs;
  const total = legs.reduce((n, l) => n + l.amount, 0);
  const summary = (rows) => rows.length ? { ...rows[0], amount: rows.reduce((n, l) => n + l.amount, 0), status: rows.every((l) => l.status === "succeeded") ? "succeeded" : rows.some((l) => l.status === "failed") ? "failed" : "unknown", legs: rows.length } : { status: "succeeded", amount: 0, legs: 0 };
  if (reservation.replay && legs.every((l) => l.status === "succeeded")) return summary(legs);
  const outcomes = /* @__PURE__ */ new Map();
  for (const leg of legs) {
    if (leg.status === "succeeded") continue;
    const payment = await prisma.payment.findUnique({ where: { id: leg.paymentId }, include: { paymentProvider: true } });
    if (payment.paymentMethod === "gift_card") {
      outcomes.set(leg.id, { status: "succeeded", id: `giftcard:${leg.id}`, giftCardId: payment.data?.giftCardId });
      continue;
    }
    if (payment.paymentMethod === "cash" || !payment.providerPaymentId) {
      outcomes.set(leg.id, { status: "succeeded", id: `manual:${leg.id}` });
      continue;
    }
    try {
      const prov = payment.paymentProvider || await provider(prisma);
      const result = await refundPayment({ provider: prov, paymentId: payment.providerPaymentId, amount: leg.amount, currency: leg.currencyCode, idempotencyKey: leg.idempotencyKey });
      outcomes.set(leg.id, { status: result.status === "succeeded" ? "succeeded" : result.status === "failed" ? "failed" : "unknown", id: result.id || result.refundId });
    } catch {
      outcomes.set(leg.id, { status: "unknown", id: "" });
    }
  }
  return prisma.$transaction(async (tx) => {
    const b = await tx.booking.findUnique({ where: { id: a.bookingId } });
    await lockTransactionKey(tx, `departure:${b.departureId}`);
    let settled = true, newlySettled = false;
    for (const leg of legs) {
      const current = await tx.refund.findUnique({ where: { id: leg.id } });
      if (current.status === "succeeded") continue;
      const outcome = outcomes.get(leg.id) || { status: "unknown", id: "" };
      await tx.refund.update({ where: { id: leg.id }, data: { status: outcome.status, providerRefundId: outcome.id || "", processedAt: outcome.status === "succeeded" ? /* @__PURE__ */ new Date() : null } });
      if (outcome.status !== "succeeded") {
        settled = false;
        continue;
      }
      newlySettled = true;
      if (outcome.giftCardId) await returnToCard(tx, { cardId: outcome.giftCardId, amount: leg.amount, key: `gift-return:${leg.id}`, booking: b, paymentId: leg.paymentId, reason: a.reason, actorId: a.actorId });
      const p2 = await tx.payment.findUnique({ where: { id: leg.paymentId } });
      const refunded = (p2.refundedAmount || 0) + leg.amount;
      await tx.payment.update({ where: { id: p2.id }, data: { refundedAmount: refunded, status: refunded >= p2.amount ? "refunded" : "partially_refunded" } });
      if (p2.paymentCollectionId) await tx.paymentCollection.update({ where: { id: p2.paymentCollectionId }, data: { refundedAmount: { increment: leg.amount } } });
    }
    if (!settled) await audit(tx, a.actorId, "refund.unresolved", "Refund", legs[0].id, null, { legs: legs.map((l) => ({ id: l.id, status: outcomes.get(l.id)?.status || l.status })) }, "Reconcile with the provider before retrying", a.key);
    else if (a.tenderOnly) {
      if (newlySettled) await audit(tx, a.actorId, "refund.settled", "Booking", b.id, null, { amount: total, legs: legs.length }, a.reason, a.key);
    } else if (!legs.length || newlySettled) {
      const refunded = (b.refundedCents || 0) + total;
      const data = { refundedCents: refunded };
      if (a.cancel) {
        data.status = refunded >= b.totalCents && b.totalCents > 0 ? "refunded" : "cancelled";
        data.seats = 0;
        if (b.totalCents === 0) data.status = "cancelled";
      } else if (refunded > 0 && refunded >= b.totalCents) data.status = "refunded";
      if (data.status && data.status !== b.status) assertMove("booking", b.status, data.status);
      await tx.booking.update({ where: { id: b.id }, data });
      if (data.status === "cancelled" || data.status === "refunded") {
        const used = await tx.promoRedemption.findMany({ where: { bookingId: b.id, status: "committed" }, select: { id: true, promoCodeId: true } });
        for (const r of used) {
          await tx.promoRedemption.update({ where: { id: r.id }, data: { status: "released" } });
          await tx.promoCode.updateMany({ where: { id: r.promoCodeId, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
        }
        await refreshDepartureStatus(tx, b.departureId);
        await promoteWaitlist(tx, b.departureId, a.actorId);
      }
      await audit(tx, a.actorId, a.cancel ? "booking.cancelled" : "booking.refunded", "Booking", b.id, { status: b.status, refundedCents: b.refundedCents }, data, a.reason, a.key);
    }
    return summary(legs.length ? await tx.refund.findMany({ where: { id: { in: legs.map((l) => l.id) } }, orderBy: { createdAt: "asc" } }) : []);
  }, { timeout: 2e4 });
}
async function cancelMyBooking(_r, args, context) {
  const booking = await context.prisma.booking.findUnique({ where: { bookingRef: String(args.bookingRef || "").trim().toUpperCase() }, include: { departure: true } });
  if (!booking || norm2(booking.guestEmail) !== norm2(args.email)) throw userFacingError(new Error("Booking not found"));
  if (booking.status === "pending_payment") {
    await context.prisma.$transaction(async (tx) => {
      await lockTransactionKey(tx, `departure:${booking.departureId}`);
      const gone = await tx.booking.updateMany({ where: { id: booking.id, status: "pending_payment" }, data: { status: "cancelled" } });
      if (!gone.count || !booking.holdId) return;
      await tx.inventoryHold.updateMany({ where: { id: booking.holdId, status: "active" }, data: { status: "released" } });
      await releaseHoldPromos(tx, [booking.holdId]);
    }, { timeout: 2e4 });
    return bookingView(context.prisma, await context.prisma.booking.findUnique({ where: { id: booking.id } }));
  }
  if (booking.status !== "confirmed") throw userFacingError(new Error("Only confirmed bookings can be cancelled"));
  if (booking.departure.startAt <= /* @__PURE__ */ new Date()) throw userFacingError(new Error("Departure has started"));
  if (booking.departure.startAt.getTime() - (booking.departure.bookingCutoffMinutes ?? 0) * 6e4 <= Date.now()) throw userFacingError(new Error("Online cancellation closed before the start. Contact the operator."));
  const refundable = booking.totalCents - booking.refundedCents;
  const amount = refundPolicyAmount(refundable, booking.policySnapshot?.rules || [], (booking.departure.startAt.getTime() - Date.now()) / 36e5);
  await issueRefund(context.prisma, { bookingId: booking.id, amount, reason: "Guest cancellation per policy", key: `cancel:${booking.id}:${args.idempotencyKey}`, actorId: null, cancel: true });
  return bookingView(context.prisma, booking);
}
async function bookingRefExists(_r, args, context) {
  return !!await context.prisma.booking.findUnique({ where: { bookingRef: String(args.bookingRef || "").trim().toUpperCase() }, select: { id: true } });
}
async function requestRefundApproval(root, args, context) {
  await authorize(context, "canIssueRefunds");
  const booking = await context.prisma.booking.findUnique({ where: { id: args.bookingId } });
  if (!booking || !LIVE2.includes(booking.status)) throw userFacingError(new Error("Booking cannot be refunded"));
  if (!Number.isSafeInteger(args.amount) || args.amount < 1 || args.amount > booking.totalCents - booking.refundedCents) throw userFacingError(new Error("Amount must be between 1 cent and the unrefunded balance"));
  const reason = String(args.reason || "").trim();
  const open = await context.prisma.managerApproval.findFirst({ where: { actionType: "refund_booking", targetId: booking.id, amount: args.amount, reason, requestedById: context.session.itemId, status: { in: ["pending", "approved"] }, expiresAt: { gt: /* @__PURE__ */ new Date() } } });
  if (open) return open;
  return requestManagerApproval(root, { actionType: "refund_booking", targetId: args.bookingId, reason: args.reason, amount: args.amount }, context);
}
async function approveRefund(root, args, context) {
  await authorize(context, "canIssueRefunds");
  try {
    return await approveManagerApproval(root, { approvalId: args.approvalId }, context);
  } catch (e) {
    throw userFacingError(e);
  }
}
async function refundBooking(_r, args, context) {
  const user = await authorize(context, "canIssueRefunds");
  const i = args.input;
  const booking = await context.prisma.booking.findUnique({ where: { id: i.bookingId } });
  if (!booking || !LIVE2.includes(booking.status)) throw new Error("Booking cannot be refunded");
  const settings = await context.prisma.storeSettings.findFirst();
  if (!i.reason?.trim()) throw new Error("Reason required");
  let approvalId = i.approvalId;
  const replayed = !approvalId && await context.prisma.refund.findUnique({ where: { idempotencyKey: `refund:${args.idempotencyKey}` }, select: { id: true } });
  if (!approvalId && !replayed && i.amountCents > (settings?.refundApprovalThresholdCents ?? 1e4)) {
    const match = await context.prisma.managerApproval.findFirst({ where: { actionType: "refund_booking", targetId: booking.id, amount: i.amountCents, reason: String(i.reason).trim(), requestedById: user.id, status: "approved", expiresAt: { gt: /* @__PURE__ */ new Date() } }, orderBy: { approvedAt: "desc" }, select: { id: true } });
    approvalId = match?.id;
    if (!approvalId) throw new Error("This refund is over the approval threshold. Request approval first: another manager must approve this exact amount and reason.");
  }
  await issueRefund(context.prisma, { bookingId: booking.id, amount: i.amountCents, reason: i.reason, key: `refund:${args.idempotencyKey}`, actorId: user.id, cancel: !!i.cancelBooking, approvalId, approvalThresholdCents: settings?.refundApprovalThresholdCents ?? 1e4 });
  const refund = await context.prisma.refund.findUnique({ where: { idempotencyKey: `refund:${args.idempotencyKey}` } });
  return { bookingRef: booking.bookingRef, refundId: refund?.id || null };
}
async function cancelDeparture(_r, args, context) {
  const user = await authorize(context, "canManageDepartures");
  return cancelDepartureCore(context.prisma, user.id, args.input, args.idempotencyKey);
}
async function cancelDepartureCore(prisma, actorId, i, requestKey) {
  if (!["weather", "operator", "min_not_met"].includes(i.reason)) throw new Error("Reason must be weather, operator or min_not_met");
  const status = i.reason === "weather" ? "weather_cancelled" : "cancelled";
  const ids = await prisma.$transaction(async (tx) => {
    await lockTransactionKey(tx, `departure:${i.departureId}`);
    const d = await tx.departure.findUnique({ where: { id: i.departureId } });
    if (!d) throw new Error("Departure not found");
    if (["completed", "in_progress"].includes(d.status)) throw new Error("Departure already ran");
    if (d.status !== status) {
      assertMove("departure", d.status, status);
      await tx.departure.update({ where: { id: d.id }, data: { status } });
      await tx.operationalTask.updateMany({ where: { taskKey: `min:${d.id}`, status: "open" }, data: { status: "resolved" } });
      await tx.inventoryHold.updateMany({ where: { departureId: d.id, status: "active" }, data: { status: "released" } });
      const holds = await tx.inventoryHold.findMany({ where: { departureId: d.id, status: "released" }, select: { id: true } });
      await tx.promoRedemption.updateMany({ where: { holdId: { in: holds.map((h) => h.id) }, status: "reserved" }, data: { status: "released" } });
      await tx.booking.updateMany({ where: { departureId: d.id, status: "pending_payment" }, data: { status: "cancelled" } });
      await tx.guideAssignment.updateMany({ where: { departureId: d.id, status: { in: ["offered", "accepted"] } }, data: { status: "cancelled" } });
      await closeWaitlist(tx, d.id, "Departure cancelled");
      await audit(tx, actorId, "departure.cancelled", "Departure", d.id, { status: d.status }, { status }, i.reason, requestKey);
    }
    return (await tx.booking.findMany({ where: { departureId: d.id, status: { in: ["confirmed", "checked_in", "partially_refunded"] } }, select: { id: true } })).map((b) => b.id);
  }, { timeout: 2e4 });
  const credits = [];
  for (const id of ids) {
    const b = await prisma.booking.findUnique({ where: { id } });
    if (i.offerCredit && b.channelId == null) {
      const token = derivedToken("rebook", b.id);
      await prisma.booking.update({ where: { id }, data: { status: "cancelled", seats: 0, rebookCreditHash: hashToken(token) } });
      await prisma.$transaction(async (tx) => {
        await audit(tx, actorId, "booking.credit_offered", "Booking", id, null, { creditCents: b.totalCents - b.refundedCents }, i.reason);
      });
      credits.push({ bookingRef: b.bookingRef, token });
    } else {
      await issueRefund(prisma, { bookingId: id, amount: b.totalCents - b.refundedCents, reason: `Departure ${i.reason} cancellation`, key: `depcancel:${i.departureId}:${id}`, actorId, cancel: true });
    }
  }
  return { cancelledBookings: ids.length, credits };
}
async function rebookWithCredit(_r, args, context) {
  const i = args.input;
  const old = await context.prisma.booking.findFirst({ where: { rebookCreditHash: hashToken(String(i.token || "")) }, include: { lines: true, participants: true } });
  if (!old || old.creditUsedAt) throw new Error("Credit not valid");
  const target = await context.prisma.departure.findUnique({ where: { id: i.departureId }, include: { tour: true } });
  if (!target || target.tourId !== (await context.prisma.departure.findUnique({ where: { id: old.departureId } })).tourId) throw new Error("Choose a departure of the same tour");
  return command(context, args.idempotencyKey, "rebookWithCredit", { departureId: i.departureId, bookingId: old.id }, [`departure:${i.departureId}`], async (tx) => {
    const live = await tx.booking.updateMany({ where: { id: old.id, creditUsedAt: null }, data: { creditUsedAt: /* @__PURE__ */ new Date() } });
    if (live.count !== 1) throw new Error("Credit already used");
    const tickets = old.lines.filter((l) => l.kind === "ticket").map((l) => ({ id: l.catalogId, qty: l.qty }));
    const hold = await placeHold(tx, { departureId: target.id, tickets, addOns: [], token: derivedToken("rebook-hold", old.id) }, null, `rebook:${old.id}`);
    const quote = { ...hold.quote, departureId: target.id };
    const credit = old.totalCents - old.refundedCents;
    if (quote.totalCents > credit) throw new Error("Credit does not cover this departure");
    const row = await tx.inventoryHold.findUnique({ where: { id: hold.holdId } });
    const participants = old.participants.map((p2) => ({ fullName: p2.fullName, age: p2.age, email: p2.email, dietary: p2.dietary, medicalNotes: p2.medicalNotes, snapshot: p2.ticketTypeSnapshot }));
    const booking = await newBooking(tx, { quote: { ...quote, totalCents: 0, subtotalCents: quote.subtotalCents, discountCents: quote.subtotalCents + quote.addOnsCents + quote.taxCents }, lead: { name: old.guestName, email: old.guestEmail, phone: old.guestPhone }, participants, source: "online", holdId: row.id, status: "pending_payment" });
    const confirmed = await confirmBooking(tx, booking.id, null, `rebook:${old.id}`);
    await audit(tx, null, "booking.rebooked_with_credit", "Booking", old.id, null, { newBookingId: booking.id, creditCents: credit });
    return { bookingRef: confirmed.bookingRef };
  });
}
async function createChannelBooking(_r, args, context) {
  const user = await authorize(context, "canManageBookings");
  const i = args.input;
  if (!["phone", "walk_up", "reseller"].includes(i.source)) throw new Error("Invalid booking source");
  if (i.paymentMethod !== "cash") throw new Error("Only recorded cash payments are supported; use online checkout for cards");
  if (!String(i.lead?.name || "").trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.lead?.email || "")) throw new Error("Lead name and valid email required");
  return fastOperatorBooking(context, args, user);
}
async function operatorBookingByKey(_r, args, context) {
  await authorize(context, "canManageBookings");
  const key = String(args.idempotencyKey || "");
  if (!key || key.length > 200) throw new Error("Idempotency key required");
  const row = await context.prisma.idempotencyKey.findUnique({ where: { idempotencyKey: `createChannelBooking:${key}` } });
  if (!row || row.recoveryPoint !== "completed" || !row.responseBody?.bookingRef) return { found: false };
  const booking = await context.prisma.booking.findUnique({ where: { bookingRef: row.responseBody.bookingRef }, select: { bookingRef: true, guestName: true, status: true, totalCents: true, seats: true } });
  return booking ? { found: true, ...booking } : { found: false };
}
async function signWaiver(_r, args, context) {
  const i = args.input;
  const participant = await context.prisma.participant.findFirst({ where: { waiverTokenHash: hashToken(String(i.token || "")) }, include: { booking: true } });
  if (!participant) throw new Error("Waiver link not valid");
  const templateId = participant.booking.tourSnapshot?.waiverTemplateId;
  const template = templateId && await context.prisma.waiverTemplate.findUnique({ where: { id: templateId } });
  if (!template || template.status !== "published") throw new Error("Waiver unavailable");
  if (!String(i.signerName || "").trim()) throw new Error("Signer name required");
  if (i.isGuardian && !String(i.minorName || "").trim()) throw new Error("Minor name required");
  const bodyHash = (0, import_node_crypto7.createHash)("sha256").update(JSON.stringify(template.body)).digest("hex");
  const ip = String(context.req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return command(context, args.idempotencyKey, "signWaiver", { participantId: participant.id, name: i.signerName }, [`participant:${participant.id}`], async (tx) => {
    if (participant.waiverStatus === "signed") return { signed: true };
    await tx.waiverSignature.create({ data: { participantId: participant.id, templateId: template.id, templateVersion: template.version, signerName: i.signerName.trim(), isGuardian: !!i.isGuardian, minorName: i.minorName || "", signedAt: /* @__PURE__ */ new Date(), ip, userAgent: String(context.req?.headers?.["user-agent"] || "").slice(0, 300), bodyHash } });
    await tx.participant.update({ where: { id: participant.id }, data: { waiverStatus: "signed" } });
    return { signed: true };
  });
}
async function sweepDepartures(_r, args, context) {
  const user = await authorize(context, "canManageDepartures");
  return command(context, args.idempotencyKey, "sweepDepartures", {}, ["departure-sweep"], async (tx) => {
    let lapsed = 0;
    const stale = await tx.inventoryHold.findMany({ where: { status: "active", expiresAt: { lte: /* @__PURE__ */ new Date() } }, select: { departureId: true }, distinct: ["departureId"], take: 500 });
    for (const id of stale.map((h) => h.departureId).sort()) {
      await lockTransactionKey(tx, `departure:${id}`);
      lapsed += await expireStaleHolds(tx, id);
    }
    const rows = await tx.departure.findMany({ where: { status: { in: ["on_sale", "min_not_met", "confirmed", "full"] }, startAt: { gt: /* @__PURE__ */ new Date(), lt: new Date(Date.now() + 864e5 + 36e5) } }, include: { tour: true }, take: 500 });
    let tasks = 0, closed = 0;
    for (const d of rows) {
      await lockTransactionKey(tx, `departure:${d.id}`);
      const o = await departureOccupancy(tx, d.id);
      const decision = minimumDecision(o.booked, d.tour.minParticipants, d.startAt);
      if (decision.needsDecision) {
        await tx.departure.update({ where: { id: d.id }, data: { status: "min_not_met" } });
        const key = `min:${d.id}`;
        const had = await tx.operationalTask.findUnique({ where: { taskKey: key } });
        if (had?.status === "resolved") {
          await tx.operationalTask.updateMany({ where: { id: had.id, status: "resolved" }, data: { status: "open" } });
          tasks++;
        }
        if (!had) {
          await tx.operationalTask.create({ data: { name: "Run or cancel: minimum not met", departureId: d.id, taskKey: key, status: "open" } });
          tasks++;
        }
      }
      if (d.startAt.getTime() - d.bookingCutoffMinutes * 6e4 <= Date.now()) {
        await tx.departure.update({ where: { id: d.id }, data: { status: "closed" } });
        closed++;
      }
    }
    let waitlistOffers = 0;
    const waitingOn = await tx.waitlistEntry.findMany({ where: { status: { in: ["waiting", "offered"] }, departure: { startAt: { gt: /* @__PURE__ */ new Date() } } }, select: { departureId: true }, distinct: ["departureId"], take: 200 });
    for (const { departureId } of waitingOn) {
      await lockTransactionKey(tx, `departure:${departureId}`);
      waitlistOffers += (await promoteWaitlist(tx, departureId, user.id)).offered;
    }
    const { reminders, suppressedReminders } = await queueDayBeforeReminders(tx, user.id);
    await audit(tx, user.id, "departures.swept", "Departure", "sweep", null, { tasks, closed, reminders, suppressedReminders, waitlistOffers, lapsedHolds: lapsed });
    return { tasks, closed, reminders, suppressedReminders, waitlistOffers, lapsedHolds: lapsed };
  });
}
async function checkoutHold(_r, args, context) {
  const hold = await context.prisma.inventoryHold.findUnique({ where: { id: args.holdId }, include: { booking: true } });
  if (!hold) throw new Error("Booking not found");
  assertProof(String(args.token || ""), hold.cartTokenHash);
  return { id: hold.id, status: hold.status, expiresAt: hold.expiresAt, quote: hold.quote, bookingRef: hold.booking?.bookingRef || null };
}

// features/keystone/lib/tour-scope.ts
var WORKING_ASSIGNMENTS = ["accepted", "worked"];
var seesAllDepartures = (user) => !!(user?.role?.canManageDepartures || user?.role?.canManageBookings);
async function scopedDepartureFilter(db, user) {
  if (seesAllDepartures(user)) return null;
  return { assignedGuides: { some: { status: { in: WORKING_ASSIGNMENTS }, guide: { userId: user.id } } } };
}
async function assertDepartureAccess(db, user, departureId) {
  if (seesAllDepartures(user)) return;
  const hit = departureId && await db.guideAssignment.findFirst({ where: { departureId, status: { in: WORKING_ASSIGNMENTS }, guide: { userId: user.id } }, select: { id: true } });
  if (!hit) throw new Error("This departure is not on your schedule");
}

// features/keystone/lib/resourceCapacity.ts
function milliseconds(value) {
  const date = value instanceof Date ? value : new Date(value);
  return date.getTime();
}
function peakConcurrentResourceUnits(allocations, options2 = {}) {
  const hasStart = options2.startsAt !== void 0;
  const hasEnd = options2.endsAt !== void 0;
  if (hasStart !== hasEnd) return null;
  const windowStart = hasStart ? milliseconds(options2.startsAt) : Number.NEGATIVE_INFINITY;
  const windowEnd = hasEnd ? milliseconds(options2.endsAt) : Number.POSITIVE_INFINITY;
  const nowMs = options2.nowMs ?? Date.now();
  if (hasStart && (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || windowEnd <= windowStart)) return null;
  if (!Number.isFinite(nowMs)) return null;
  const points = [];
  for (const allocation of allocations) {
    if (allocation.status != null && !["held", "reserved"].includes(allocation.status)) continue;
    if (allocation.status === "held" && allocation.expiresAt != null && milliseconds(allocation.expiresAt) <= nowMs) continue;
    if (!Number.isInteger(allocation.units) || allocation.units < 1) return null;
    const allocationStart = milliseconds(allocation.startsAt);
    const allocationEnd = milliseconds(allocation.endsAt);
    if (!Number.isFinite(allocationStart) || !Number.isFinite(allocationEnd) || allocationEnd <= allocationStart) return null;
    const start = Math.max(allocationStart, windowStart);
    const end = Math.min(allocationEnd, windowEnd);
    if (end <= start) continue;
    points.push({ at: start, delta: allocation.units }, { at: end, delta: -allocation.units });
  }
  points.sort((left, right) => left.at - right.at || left.delta - right.delta);
  let occupied = 0;
  let peak = 0;
  for (const point of points) {
    occupied += point.delta;
    peak = Math.max(peak, occupied);
  }
  return peak;
}

// features/keystone/lib/tour-schedule.ts
function zonedStart(date, time, timeZone) {
  let at = /* @__PURE__ */ new Date(`${date}T${time}:00Z`);
  const target = at.getTime();
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(at);
    const p2 = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    const represented = (/* @__PURE__ */ new Date(`${p2.year}-${p2.month}-${p2.day}T${p2.hour}:${p2.minute}:${p2.second}Z`)).getTime();
    at = new Date(at.getTime() + target - represented);
  }
  return at;
}
function expandSchedule(schedule, tour, from, to) {
  const out = [];
  const weekdays = /BYDAY=([^;]+)/.exec(schedule.rrule || "")?.[1]?.split(",");
  for (let day = /* @__PURE__ */ new Date(from.toISOString().slice(0, 10) + "T12:00:00Z"); day <= to; day = new Date(day.getTime() + 864e5)) {
    if (schedule.validFrom && day < schedule.validFrom || schedule.validTo && day > schedule.validTo) continue;
    if (weekdays && !weekdays.includes(["SU", "MO", "TU", "WE", "TH", "FR", "SA"][day.getUTCDay()])) continue;
    for (const time of schedule.startTimes || ["09:00"]) {
      if (!/^\d\d:\d\d$/.test(time)) throw new Error("Invalid schedule time");
      const startAt = zonedStart(day.toISOString().slice(0, 10), time, tour.timezone || "America/New_York");
      if (startAt >= from && startAt <= to) out.push(startAt);
    }
  }
  return out;
}
function departureData(schedule, tour, startAt, departureKey) {
  return { departureKey, tourId: tour.id, scheduleId: schedule.id, startAt, endAt: new Date(startAt.getTime() + (tour.durationDays ? tour.durationDays * 1440 : tour.durationMinutes) * 6e4), capacity: Math.min(schedule.capacityOverride || tour.maxParticipants, tour.maxParticipants), status: "on_sale" };
}

// features/keystone/lib/tour-offline-checkin.ts
var MAX_EVENTS = 50;
var KEY_RE = /^[A-Za-z0-9_-]{8,80}$/;
var SKEW_MS = 5 * 6e4;
function recordedTime(raw, now) {
  const t = new Date(raw);
  if (Number.isNaN(t.getTime())) return now;
  return t.getTime() > now.getTime() + SKEW_MS ? now : t;
}
function validateBatch(events) {
  if (!Array.isArray(events) || !events.length) return "Nothing to sync";
  if (events.length > MAX_EVENTS) return `Sync at most ${MAX_EVENTS} taps at a time`;
  const seen = /* @__PURE__ */ new Set();
  for (const e of events) {
    if (!e || !KEY_RE.test(String(e.key || ""))) return "Each tap needs a key";
    if (seen.has(e.key)) return "The same tap was sent twice in one batch";
    seen.add(e.key);
    if (e.kind === "check_in" && !e.participantId) return "A check-in tap needs a participant";
    if (e.kind === "no_show" && !e.bookingId) return "A no-show tap needs a booking";
    if (e.kind !== "check_in" && e.kind !== "no_show") return "Unknown tap";
  }
  return null;
}
function decide(events, bookings, departureId, done) {
  const byBooking = new Map(bookings.map((b) => [b.id, { ...b, participants: b.participants.map((p2) => ({ ...p2 })) }]));
  const byParticipant = /* @__PURE__ */ new Map();
  for (const b of byBooking.values()) for (const p2 of b.participants) byParticipant.set(p2.id, { b, p: p2 });
  const ordered = [...events].sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
  const out = [];
  for (const e of ordered) {
    if (done.has(e.key)) {
      out.push({ key: e.key, outcome: "already", label: "Already synced" });
      continue;
    }
    if (e.kind === "check_in") {
      const hit = byParticipant.get(String(e.participantId));
      if (!hit || hit.b.departureId !== departureId) {
        out.push({ key: e.key, outcome: "conflict", label: "Check-in", reason: "This guest is no longer on this departure (moved or removed from the party). Check the booking." });
        continue;
      }
      const { b, p: p2 } = hit, label = `${p2.fullName} \xB7 ${b.bookingRef}`;
      if (p2.checkInStatus === "checked_in") {
        out.push({ key: e.key, outcome: "already", label });
        continue;
      }
      if (!["confirmed", "checked_in"].includes(b.status)) {
        out.push({ key: e.key, outcome: "conflict", label, reason: b.status === "no_show" ? "Marked no show on another device. Undo the no show at the office if they came." : `The booking is ${b.status.replaceAll("_", " ")} now.` });
        continue;
      }
      p2.checkInStatus = "checked_in";
      if (b.participants.every((x) => x.checkInStatus === "checked_in") && b.status === "confirmed") b.status = "checked_in";
      out.push({ key: e.key, outcome: "applied", kind: "check_in", bookingId: b.id, participantId: p2.id, label });
    } else {
      const b = byBooking.get(String(e.bookingId));
      if (!b || b.departureId !== departureId) {
        out.push({ key: e.key, outcome: "conflict", label: "No show", reason: "This booking is no longer on this departure." });
        continue;
      }
      const label = `No show \xB7 ${b.bookingRef}`;
      if (b.status === "no_show") {
        out.push({ key: e.key, outcome: "already", label });
        continue;
      }
      if (b.participants.some((x) => x.checkInStatus === "checked_in")) {
        out.push({ key: e.key, outcome: "conflict", label, reason: "Someone in this booking was checked in, so it was not marked no show." });
        continue;
      }
      if (b.status !== "confirmed") {
        out.push({ key: e.key, outcome: "conflict", label, reason: `The booking is ${b.status.replaceAll("_", " ")} now.` });
        continue;
      }
      b.status = "no_show";
      for (const x of b.participants) if (x.checkInStatus === "pending" || !x.checkInStatus) x.checkInStatus = "no_show";
      out.push({ key: e.key, outcome: "applied", kind: "no_show", bookingId: b.id, label });
    }
  }
  return out;
}

// features/keystone/mutations/tour-operations.ts
async function generateDepartures(_r, args, context) {
  await authorize(context, "canManageDepartures");
  return command(context, args.idempotencyKey, "generateDepartures", args.input, ["schedule-generation"], async (tx) => {
    const schedules = await tx.schedule.findMany({ where: args.input?.tourId ? { tourId: args.input.tourId } : {}, include: { tour: true }, take: 100 });
    const created = [];
    const now = /* @__PURE__ */ new Date(), horizon = new Date(now.getTime() + Math.min(60, args.input?.days || 60) * 864e5);
    for (const schedule of schedules) {
      if (schedule.tour.status !== "active") continue;
      for (const startAt of expandSchedule(schedule, schedule.tour, now, horizon)) {
        const departureKey = `${schedule.tourId}:${startAt.toISOString()}`;
        if (await tx.departure.findUnique({ where: { departureKey } })) continue;
        const d = await tx.departure.create({ data: departureData(schedule, schedule.tour, startAt, departureKey) });
        created.push(d.id);
      }
    }
    await audit(tx, context.session.itemId, "departures.generated", "Schedule", args.input?.tourId || "all", null, { count: created.length });
    return { created: created.length, ids: created };
  });
}
async function assignGuide(_r, args, context) {
  await authorize(context, "canManageGuides");
  const i = args.input;
  return command(context, args.idempotencyKey, "assignGuide", i, [`departure:${i.departureId}`, `guide:${i.guideId}`], async (tx) => {
    const departure = await tx.departure.findUnique({ where: { id: i.departureId }, include: { tour: true } });
    const guide = await tx.guide.findUnique({ where: { id: i.guideId }, include: { certifications: true, availability: true } });
    if (!departure || !guide || guide.status !== "active") throw new Error("Guide or departure unavailable");
    if (["completed", "cancelled", "weather_cancelled"].includes(departure.status)) throw new Error("Departure is closed");
    for (const name3 of departure.tour.requiredCertifications || []) if (!guide.certifications.some((c) => c.name === name3 && (!c.expiresAt || c.expiresAt > departure.endAt))) throw new Error(`Valid ${name3} certification required`);
    const conflict = await tx.guideAssignment.findFirst({ where: { guideId: guide.id, departureId: { not: departure.id }, status: { in: ["accepted", "worked"] }, departure: { startAt: { lt: departure.endAt }, endAt: { gt: departure.startAt }, status: { notIn: ["cancelled", "weather_cancelled"] } } } });
    if (conflict) throw new Error("Guide has an overlapping accepted assignment");
    for (const availability of guide.availability) {
      for (const block of availability.unavailable || []) if (new Date(block.startAt) < departure.endAt && new Date(block.endAt) > departure.startAt) throw new Error("Guide is unavailable");
    }
    const existing = await tx.guideAssignment.findFirst({ where: { guideId: guide.id, departureId: departure.id, status: { notIn: ["declined", "cancelled"] } } });
    if (existing) return existing;
    const assignment = await tx.guideAssignment.create({ data: { guideId: guide.id, departureId: departure.id, role: i.role || "lead", status: "offered", payCents: guide.payRateType === "hourly" ? Math.round(guide.payRateCents * (departure.endAt - departure.startAt) / 36e5) : guide.payRateCents } });
    await audit(tx, context.session.itemId, "guide.offered", "GuideAssignment", assignment.id, null, assignment);
    return assignment;
  });
}
async function respondToAssignment(_r, args, context) {
  if (!context.session?.itemId) throw new Error("Not authorized");
  const i = args.input;
  const assignment = await context.prisma.guideAssignment.findUnique({ where: { id: i.assignmentId }, include: { guide: true } });
  if (!assignment || assignment.guide?.userId !== context.session.itemId) await authorize(context, "canManageGuides");
  if (!assignment) throw new Error("Assignment not found");
  return command(context, args.idempotencyKey, "respondToAssignment", i, [`departure:${assignment.departureId}`, `guide:${assignment.guideId}`], async (tx) => {
    const a = await tx.guideAssignment.findUnique({ where: { id: assignment.id }, include: { departure: { include: { tour: true } }, guide: { include: { certifications: true } } } });
    if (a.status !== "offered" || !["accepted", "declined"].includes(i.status)) throw new Error("Invalid assignment transition");
    if (i.status === "accepted") {
      const conflict = await tx.guideAssignment.findFirst({ where: { guideId: a.guideId, id: { not: a.id }, status: { in: ["accepted", "worked"] }, departure: { startAt: { lt: a.departure.endAt }, endAt: { gt: a.departure.startAt }, status: { notIn: ["cancelled", "weather_cancelled"] } } } });
      if (conflict) throw new Error("Guide has an overlapping assignment");
      for (const name3 of a.departure.tour.requiredCertifications || []) if (!a.guide.certifications.some((c) => c.name === name3 && (!c.expiresAt || c.expiresAt > a.departure.endAt))) throw new Error(`Valid ${name3} certification required (expired or missing by the end of this departure)`);
    }
    const result = await tx.guideAssignment.updateMany({ where: { id: a.id, status: "offered" }, data: { status: i.status } });
    if (result.count !== 1) throw new Error("Assignment changed concurrently");
    await audit(tx, context.session.itemId, "guide.responded", "GuideAssignment", a.id, { status: "offered" }, { status: i.status });
    return { id: a.id, status: i.status };
  });
}
async function assignResource(_r, args, context) {
  await authorize(context, "canManageResources");
  const i = args.input;
  return command(context, args.idempotencyKey, "assignResource", i, [`departure:${i.departureId}`, `resource:${i.resourceId}`], async (tx) => {
    const o = await departureOccupancy(tx, i.departureId);
    const d = o.departure;
    const resource = await tx.resource.findUnique({ where: { id: i.resourceId } });
    if (!resource || resource.status !== "active" || resource.kind !== d.tour.requiresResourceKind) throw new Error("Resource does not satisfy this tour");
    if (!Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > resource.quantity) throw new Error("Invalid resource quantity");
    const assignments = await tx.resourceAssignment.findMany({ where: { resourceId: resource.id, departureId: { not: d.id }, departure: { startAt: { lt: d.endAt }, endAt: { gt: d.startAt }, status: { notIn: ["cancelled", "weather_cancelled"] } } }, include: { departure: true } });
    const peak = peakConcurrentResourceUnits([...assignments.map((a) => ({ units: a.quantity, startsAt: a.departure.startAt, endsAt: a.departure.endAt })), { units: i.quantity, startsAt: d.startAt, endsAt: d.endAt }]);
    if (peak === null || peak > resource.quantity) throw new Error("Resource pool overlaps another departure");
    const capacity = Math.min(d.tour.maxParticipants, resource.seats * i.quantity);
    if (capacity < o.booked + o.held + o.allocated) throw new Error("Resource seats below active reservations");
    await tx.resourceAssignment.deleteMany({ where: { departureId: d.id } });
    const result = await tx.resourceAssignment.create({ data: { departureId: d.id, resourceId: resource.id, quantity: i.quantity } });
    await tx.departure.update({ where: { id: d.id }, data: { capacity } });
    await audit(tx, context.session.itemId, "resource.assigned", "Departure", d.id, { capacity: d.capacity }, { capacity, resourceId: resource.id });
    return result;
  });
}
async function unassignResource(_r, args, context) {
  await authorize(context, "canManageResources");
  const i = args.input;
  return command(context, args.idempotencyKey, "unassignResource", i, [`departure:${i.departureId}`], async (tx) => {
    const d = await tx.departure.findUnique({ where: { id: i.departureId }, select: { id: true, status: true, capacity: true, endAt: true } });
    if (!d) throw new Error("Departure not found");
    if (["completed", "cancelled", "weather_cancelled"].includes(d.status)) throw new Error("This departure is finished; its resources are kept for the record");
    const removed = await tx.resourceAssignment.deleteMany({ where: { departureId: d.id } });
    if (!removed.count) throw new Error("No resource is assigned to this departure");
    await audit(tx, context.session.itemId, "resource.unassigned", "Departure", d.id, { assignments: removed.count }, null);
    return { id: d.id, removed: removed.count };
  });
}
async function resizeDeparture(_r, args, context) {
  await authorize(context, "canManageDepartures");
  const i = args.input;
  return command(context, args.idempotencyKey, "resizeDeparture", i, [`departure:${i.departureId}`], async (tx) => {
    const o = await departureOccupancy(tx, i.departureId);
    if (!Number.isInteger(i.capacity) || i.capacity < 1 || i.capacity > o.departure.tour.maxParticipants || i.capacity < o.booked + o.held + o.allocated) throw new Error("Capacity must cover reservations and stay within tour maximum");
    const assignments = await tx.resourceAssignment.findMany({ where: { departureId: i.departureId }, include: { resource: true } });
    if (assignments.length && i.capacity > assignments.reduce((n, a) => n + a.quantity * a.resource.seats, 0)) throw new Error("Capacity exceeds resource seats");
    const result = await tx.departure.update({ where: { id: i.departureId }, data: { capacity: i.capacity } });
    await audit(tx, context.session.itemId, "departure.resized", "Departure", i.departureId, { capacity: o.departure.capacity }, { capacity: i.capacity });
    if (i.capacity > o.departure.capacity) await promoteWaitlist(tx, i.departureId, context.session.itemId);
    return result;
  });
}
async function checkInParticipant(_r, args, context) {
  const actor = await authorize(context, "canCheckIn");
  const i = args.input;
  const participant = await context.prisma.participant.findUnique({ where: { id: i.participantId }, include: { booking: true } });
  if (!participant) throw new Error("Participant not found");
  await assertDepartureAccess(context.prisma, actor, participant.booking.departureId);
  return command(context, args.idempotencyKey, "checkInParticipant", i, [`departure:${participant.booking.departureId}`], async (tx) => {
    const p2 = await tx.participant.findUnique({ where: { id: participant.id }, include: { booking: true } });
    if (!["confirmed", "checked_in"].includes(p2.booking.status)) throw new Error("Booking is not confirmed");
    await tx.participant.update({ where: { id: p2.id }, data: { checkInStatus: "checked_in" } });
    const pending = await tx.participant.count({ where: { bookingId: p2.bookingId, checkInStatus: { not: "checked_in" } } });
    if (!pending) await tx.booking.updateMany({ where: { id: p2.bookingId, status: "confirmed" }, data: { status: "checked_in" } });
    await audit(tx, context.session.itemId, "participant.checked_in", "Participant", p2.id, { status: p2.checkInStatus }, { status: "checked_in" });
    return { id: p2.id, waiverWarning: p2.waiverStatus === "required" };
  });
}
async function markNoShow(_r, args, context) {
  const actor = await authorize(context, "canCheckIn");
  const i = args.input;
  const booking = await context.prisma.booking.findUnique({ where: { id: i.bookingId } });
  if (!booking) throw new Error("Booking not found");
  await assertDepartureAccess(context.prisma, actor, booking.departureId);
  return command(context, args.idempotencyKey, "markNoShow", i, [`departure:${booking.departureId}`], async (tx) => {
    const change = await tx.booking.updateMany({ where: { id: booking.id, status: "confirmed" }, data: { status: "no_show" } });
    if (change.count !== 1) throw new Error("Only confirmed bookings can be marked no show");
    await tx.participant.updateMany({ where: { bookingId: booking.id, checkInStatus: "pending" }, data: { checkInStatus: "no_show" } });
    await audit(tx, context.session.itemId, "booking.no_show", "Booking", booking.id, { status: "confirmed" }, { status: "no_show" });
    return { id: booking.id };
  });
}
async function undoNoShow(_r, args, context) {
  const actor = await authorize(context, "canCheckIn");
  const i = args.input;
  const booking = await context.prisma.booking.findUnique({ where: { id: i.bookingId } });
  if (!booking) throw new Error("Booking not found");
  await assertDepartureAccess(context.prisma, actor, booking.departureId);
  return command(context, args.idempotencyKey, "undoNoShow", i, [`departure:${booking.departureId}`], async (tx) => {
    const d = await tx.departure.findUnique({ where: { id: booking.departureId } });
    if (["completed", "cancelled", "weather_cancelled"].includes(d.status)) throw new Error("This departure is finished; the no show stands");
    assertMove("booking", "no_show", "confirmed");
    const change = await tx.booking.updateMany({ where: { id: booking.id, status: "no_show" }, data: { status: "confirmed" } });
    if (change.count !== 1) throw new Error("Only a booking marked no show can be undone");
    await tx.participant.updateMany({ where: { bookingId: booking.id, checkInStatus: "no_show" }, data: { checkInStatus: "pending" } });
    await audit(tx, context.session.itemId, "booking.no_show_undone", "Booking", booking.id, { status: "no_show" }, { status: "confirmed" });
    return { id: booking.id };
  });
}
async function closeDeparture(_r, args, context) {
  await authorize(context, "canManageDepartures");
  const i = args.input;
  return command(context, args.idempotencyKey, "closeDeparture", i, [`departure:${i.departureId}`], async (tx) => {
    const d = await tx.departure.findUnique({ where: { id: i.departureId }, include: { assignedGuides: true } });
    if (!d || !["closed", "in_progress"].includes(d.status) || d.endAt > /* @__PURE__ */ new Date()) throw new Error("Only an ended closed/in-progress departure can complete");
    assertMove("departure", d.status, "completed");
    await tx.departure.update({ where: { id: d.id }, data: { status: "completed" } });
    const missed = await tx.booking.findMany({ where: { departureId: d.id, status: "confirmed" }, select: { id: true } });
    if (missed.length) {
      await tx.booking.updateMany({ where: { id: { in: missed.map((b) => b.id) }, status: "confirmed" }, data: { status: "no_show" } });
      await tx.participant.updateMany({ where: { bookingId: { in: missed.map((b) => b.id) }, checkInStatus: "pending" }, data: { checkInStatus: "no_show" } });
      await audit(tx, context.session.itemId, "departure.unattended_no_show", "Departure", d.id, null, { bookings: missed.length });
    }
    await tx.guideAssignment.updateMany({ where: { departureId: d.id, status: "offered" }, data: { status: "cancelled" } });
    const toComplete = await tx.booking.findMany({ where: { departureId: d.id, status: "checked_in" }, include: { channel: true, payments: { where: { status: { in: ["succeeded", "partially_refunded", "refunded"] } } } } });
    for (const b of toComplete) {
      const paid = b.payments.reduce((n, p2) => n + p2.amount - (p2.refundedAmount || 0), 0);
      if (b.channel?.paymentModel === "channel_collects" || paid >= b.totalCents - b.refundedCents) await tx.booking.update({ where: { id: b.id }, data: { status: "completed" } });
    }
    for (const a of d.assignedGuides.filter((a2) => a2.status === "accepted")) {
      const payout = await tx.guidePayout.create({ data: { guideId: a.guideId, periodStart: d.startAt, periodEnd: d.endAt, totalCents: a.payCents, status: "draft" } });
      await tx.guideAssignment.update({ where: { id: a.id }, data: { status: "worked", payoutId: payout.id } });
    }
    await audit(tx, context.session.itemId, "departure.completed", "Departure", d.id, { status: d.status }, { status: "completed" });
    return { id: d.id };
  });
}
async function generateChannelStatement(_r, args, context) {
  await authorize(context, "canManageChannels");
  const i = args.input;
  return command(context, args.idempotencyKey, "generateChannelStatement", i, [`channel:${i.channelId}`], async (tx) => {
    const from = new Date(i.from), to = new Date(i.to);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from) throw new Error("Invalid statement period");
    const channel = await tx.channel.findUnique({ where: { id: i.channelId } });
    if (!channel) throw new Error("Channel not found");
    const where = { channelId: channel.id, statementId: null, createdAt: { gte: from, lt: to }, status: { in: ["confirmed", "completed", "checked_in", "no_show", "partially_refunded", "cancelled"] } };
    const candidates = await tx.booking.findMany({ where, select: { departureId: true } });
    for (const id of [...new Set(candidates.map((b) => b.departureId))].sort()) await lockTransactionKey(tx, `departure:${id}`);
    const bookings = await tx.booking.findMany({ where });
    if (!bookings.length) throw new Error("No unstatemented bookings in this period");
    if (bookings.some((b) => b.currencyCode !== "USD")) throw new Error("Mixed or unsupported statement currency");
    const grossCents = bookings.reduce((n, b) => n + b.totalCents - b.refundedCents, 0);
    const commissionCents = bookings.reduce((n, b) => n + settlement(b.totalCents - b.refundedCents, b.totalCents ? Math.round(b.channelCommissionCents * 1e4 / b.totalCents) : 0).commissionCents, 0);
    const statement = await tx.channelStatement.create({ data: { statementKey: `${channel.id}:${from.toISOString()}:${to.toISOString()}`, channelId: channel.id, periodStart: from, periodEnd: to, grossCents, commissionCents, netDueCents: channel.paymentModel === "channel_collects" ? grossCents - commissionCents : -commissionCents, status: "open" } });
    await tx.booking.updateMany({ where: { id: { in: bookings.map((b) => b.id) } }, data: { statementId: statement.id } });
    await audit(tx, context.session.itemId, "channel.statement_created", "ChannelStatement", statement.id, null, { grossCents, commissionCents });
    return statement;
  });
}
async function syncOfflineCheckIns(_r, args, context) {
  const actor = await authorize(context, "canCheckIn");
  const i = args.input || {};
  const departureId = String(i.departureId || ""), events = i.events || [];
  const bad = validateBatch(events);
  if (bad) throw new Error(bad);
  await assertDepartureAccess(context.prisma, actor, departureId);
  const rid = (k) => `offline:${actor.id}:${k}`;
  return command(context, args.idempotencyKey, "syncOfflineCheckIns", { departureId, keys: events.map((e) => e.key) }, [`departure:${departureId}`], async (tx) => {
    const now = /* @__PURE__ */ new Date();
    const prior = await tx.auditEvent.findMany({ where: { requestId: { in: events.map((e) => rid(e.key)) } }, select: { requestId: true, after: true } });
    const stored = new Map(prior.map((a) => [a.requestId, a.after?.decision]));
    const fresh = events.filter((e) => !stored.has(rid(e.key)));
    const pids = fresh.filter((e) => e.kind === "check_in").map((e) => String(e.participantId));
    const bids = fresh.filter((e) => e.kind === "no_show").map((e) => String(e.bookingId));
    const bookings = fresh.length ? await tx.booking.findMany({ where: { OR: [{ id: { in: bids } }, { participants: { some: { id: { in: pids } } } }] }, select: { id: true, bookingRef: true, status: true, departureId: true, participants: { select: { id: true, fullName: true, checkInStatus: true } } } }) : [];
    const decided = decide(fresh, bookings, departureId, /* @__PURE__ */ new Set());
    const applied = decided.filter((d) => d.outcome === "applied");
    const ins = applied.filter((d) => d.kind === "check_in"), outs = applied.filter((d) => d.kind === "no_show");
    if (ins.length) await tx.participant.updateMany({ where: { id: { in: ins.map((d) => d.participantId) } }, data: { checkInStatus: "checked_in" } });
    if (outs.length) {
      await tx.booking.updateMany({ where: { id: { in: outs.map((d) => d.bookingId) }, status: "confirmed" }, data: { status: "no_show" } });
      await tx.participant.updateMany({ where: { bookingId: { in: outs.map((d) => d.bookingId) }, checkInStatus: "pending" }, data: { checkInStatus: "no_show" } });
    }
    const touched = [...new Set(ins.map((d) => d.bookingId))];
    if (touched.length) {
      const pending = await tx.participant.findMany({ where: { bookingId: { in: touched }, checkInStatus: { not: "checked_in" } }, select: { bookingId: true } });
      const full = touched.filter((id) => !pending.some((p2) => p2.bookingId === id));
      if (full.length) await tx.booking.updateMany({ where: { id: { in: full }, status: "confirmed" }, data: { status: "checked_in" } });
    }
    const byKey = new Map(fresh.map((e) => [e.key, e]));
    await tx.auditEvent.createMany({ data: decided.map((d) => {
      const e = byKey.get(d.key), at = recordedTime(e.recordedAt, now).toISOString();
      const action = d.outcome === "conflict" ? "checkin.offline_conflict" : d.outcome === "already" ? "checkin.offline_duplicate" : d.kind === "check_in" ? "participant.checked_in" : "booking.no_show";
      const target = d.kind === "check_in" || e.kind === "check_in" ? ["Participant", String(e.participantId)] : ["Booking", String(e.bookingId)];
      return { actorId: actor.id, action, targetList: target[0], targetId: target[1], after: { offline: true, recordedAt: at, syncedAt: now.toISOString(), decision: d }, reason: d.reason || "", requestId: rid(d.key) };
    }) });
    const results = events.map((e) => stored.has(rid(e.key)) ? { ...stored.get(rid(e.key)), replay: true } : decided.find((d) => d.key === e.key));
    return { results, applied: applied.length, conflicts: results.filter((r) => r.outcome === "conflict").length };
  });
}

// features/keystone/mutations/tour-weather.ts
var PENDING = ["confirmed", "checked_in", "partially_refunded"];
var OPEN_FOR_SALE = ["on_sale", "confirmed", "min_not_met"];
async function weatherCancelDeparture(_r, args, context) {
  try {
    return await weatherCancelCore(args, context);
  } catch (e) {
    throw userFacingError(e);
  }
}
async function weatherCancelCore(args, context) {
  const user = await authorize(context, "canManageDepartures");
  const i = args.input, reason = String(i.reason || "").trim();
  if (reason.length < 3) throw new Error('A weather reason is required (for example "Small-craft advisory")');
  if (reason.length > 500) throw new Error("Reason is too long (maximum 500 characters)");
  return command(context, args.idempotencyKey, "weatherCancelDeparture", { departureId: i.departureId, reason }, [`departure:${i.departureId}`], async (tx) => {
    const d = await tx.departure.findUnique({ where: { id: i.departureId }, include: { tour: true } });
    if (!d) throw new Error("Departure not found");
    if (["completed", "in_progress"].includes(d.status)) throw new Error("Departure already ran");
    if (d.status === "cancelled") throw new Error("Departure is already cancelled for another reason");
    if (d.status !== "weather_cancelled") {
      await tx.departure.update({ where: { id: d.id }, data: { status: "weather_cancelled" } });
      await tx.operationalTask.updateMany({ where: { taskKey: `min:${d.id}`, status: "open" }, data: { status: "resolved" } });
      const holds = await tx.inventoryHold.findMany({ where: { departureId: d.id, status: "active" }, select: { id: true } });
      await tx.inventoryHold.updateMany({ where: { departureId: d.id, status: "active" }, data: { status: "released" } });
      await tx.promoRedemption.updateMany({ where: { holdId: { in: holds.map((h) => h.id) }, status: "reserved" }, data: { status: "released" } });
      await tx.booking.updateMany({ where: { departureId: d.id, status: "pending_payment" }, data: { status: "cancelled" } });
      await tx.guideAssignment.updateMany({ where: { departureId: d.id, status: { in: ["offered", "accepted"] } }, data: { status: "cancelled" } });
      await closeWaitlist(tx, d.id, "Departure cancelled for weather");
      await audit(tx, user.id, "departure.weather_cancelled", "Departure", d.id, { status: d.status }, { status: "weather_cancelled" }, reason, args.idempotencyKey);
    }
    const bookings = await tx.booking.findMany({ where: { departureId: d.id, status: { in: PENDING } } });
    let queued = 0, suppressed = 0;
    for (const b of bookings) {
      const r = await queueGuestNotification(tx, "weather_cancellation", b, { tourName: d.tour.name, startAt: d.startAt, timezone: d.tour.timezone, refundCents: b.totalCents - b.refundedCents, currency: b.currencyCode, meetingPoint: null }, user.id);
      if (r === "notification.queued") queued++;
      else if (r) suppressed++;
    }
    return { departureId: d.id, awaitingChoice: bookings.length, noticesQueued: queued, noticesHeldBack: suppressed };
  });
}
async function rebookWeatherBooking(_r, args, context) {
  try {
    return await rebookCore(args, context);
  } catch (e) {
    throw userFacingError(e);
  }
}
async function rebookCore(args, context) {
  const user = await authorize(context, "canManageBookings");
  const i = args.input;
  const probe = await context.prisma.booking.findUnique({ where: { id: i.bookingId }, select: { departureId: true } });
  if (!probe) throw new Error("Booking not found");
  return command(context, args.idempotencyKey, "rebookWeatherBooking", { bookingId: i.bookingId, departureId: i.departureId }, [`departure:${i.departureId}`, `departure:${probe.departureId}`], (tx) => rebookInTx(tx, user.id, i, args.idempotencyKey));
}
async function rebookInTx(tx, actorId, i, requestKey) {
  const old = await tx.booking.findUnique({ where: { id: i.bookingId }, include: { lines: true, participants: true, departure: true } });
  if (!old.departure || old.departure.status !== "weather_cancelled") throw new Error("Only bookings on a weather-cancelled departure can be rebooked here");
  if (!PENDING.includes(old.status) || old.creditUsedAt) throw new Error("This booking has already been resolved");
  if (old.channelId) throw new Error("Reseller bookings are re-planned with the reseller; use the refund instead");
  if (i.departureId === old.departureId) throw new Error("Choose a different departure");
  const target = await tx.departure.findUnique({ where: { id: i.departureId }, include: { tour: true } });
  if (!target || target.tourId !== old.departure.tourId) throw new Error("Choose a departure of the same tour");
  const credit = old.totalCents - old.refundedCents;
  const tickets = old.lines.filter((l) => l.kind === "ticket").map((l) => ({ id: l.catalogId, qty: l.qty }));
  const addOns = old.lines.filter((l) => l.kind === "addon").map((l) => ({ id: l.catalogId, qty: l.qty }));
  const hold = await placeHold(tx, { departureId: target.id, tickets, addOns, token: derivedToken("weather-rebook-hold", old.id) }, actorId, `weather-rebook:${old.id}`);
  const quote = { ...hold.quote, departureId: target.id };
  if (quote.totalCents !== credit) {
    const f = (c) => `$${(c / 100).toFixed(2)}`;
    throw new Error(`That departure costs ${f(quote.totalCents)} but the guest paid ${f(credit)}. Pick a departure at the same price or refund instead`);
  }
  const row = await tx.inventoryHold.findUnique({ where: { id: hold.holdId } });
  const participants = old.participants.map((p2) => ({ fullName: p2.fullName, age: p2.age, email: p2.email, dietary: p2.dietary, medicalNotes: p2.medicalNotes, snapshot: p2.ticketTypeSnapshot }));
  const booking = await newBooking(tx, { quote: { ...quote, totalCents: 0, discountCents: quote.subtotalCents + quote.addOnsCents + quote.taxCents }, lead: { name: old.guestName, email: old.guestEmail, phone: old.guestPhone, specialRequests: old.specialRequests, pickupLocation: old.pickupLocation }, participants, source: old.source, holdId: row.id, status: "pending_payment" });
  const confirmed = await confirmBooking(tx, booking.id, actorId, `weather-rebook:${old.id}`);
  if (!confirmed) throw new Error("Not enough seats on that departure");
  const moved = await tx.booking.updateMany({ where: { id: old.id, creditUsedAt: null, status: { in: PENDING } }, data: { status: "cancelled", seats: 0, creditUsedAt: /* @__PURE__ */ new Date() } });
  if (moved.count !== 1) throw new Error("This booking has already been resolved");
  await audit(tx, actorId, "booking.weather_rebooked", "Booking", old.id, { status: old.status }, { newBookingId: booking.id, newBookingRef: confirmed.bookingRef, departureId: target.id, creditCents: credit }, "Weather cancellation rebook", requestKey);
  return { bookingRef: confirmed.bookingRef, previousBookingRef: old.bookingRef };
}
async function weatherCancellations(_r, _a, context) {
  await authorize(context, "canManageBookings");
  const db = context.prisma, now = /* @__PURE__ */ new Date();
  const deps = await db.departure.findMany({ where: { status: "weather_cancelled", startAt: { gte: new Date(+now - 14 * 864e5) } }, orderBy: { startAt: "asc" }, take: 40, include: { tour: { select: { id: true, name: true } } } });
  if (!deps.length) return { departures: [] };
  const depIds = deps.map((d) => d.id);
  const bookings = await db.booking.findMany({ where: { departureId: { in: depIds }, status: { in: [...PENDING, "refunded", "cancelled"] } }, orderBy: { createdAt: "asc" }, take: 600 });
  const noticeRows = bookings.length ? await db.auditEvent.findMany({ where: { targetList: "Notification", targetId: { in: bookings.map((b) => `weather_cancellation:${b.id}`) } } }) : [];
  const notice = new Map(noticeRows.map((n) => [n.targetId, n.action === "notification.queued" ? "queued" : "held back"]));
  const reasons = await db.auditEvent.findMany({ where: { action: "departure.weather_cancelled", targetId: { in: depIds } }, orderBy: { createdAt: "desc" } });
  const reasonOf = new Map(reasons.map((a) => [a.targetId, a.reason]));
  const tourIds = [...new Set(deps.filter((d) => bookings.some((b) => b.departureId === d.id && PENDING.includes(b.status))).map((d) => d.tourId))];
  const options2 = /* @__PURE__ */ new Map();
  for (const tourId of tourIds) {
    const rows = await db.departure.findMany({ where: { tourId, status: { in: OPEN_FOR_SALE }, startAt: { gt: now } }, orderBy: { startAt: "asc" }, take: 8 });
    const withRoom = await Promise.all(rows.map(async (r) => {
      const o = await occupancyNumbers(db, r.id, r.startAt);
      return { id: r.id, startAt: r.startAt, remaining: Math.max(0, r.capacity - o.booked - o.held - o.allocated) };
    }));
    options2.set(tourId, withRoom);
  }
  return {
    departures: deps.map((d) => {
      const mine = bookings.filter((b) => b.departureId === d.id);
      const pending = mine.filter((b) => PENDING.includes(b.status));
      return {
        id: d.id,
        startAt: d.startAt,
        tourName: d.tour.name,
        reason: reasonOf.get(d.id) || "",
        resolved: mine.length - pending.length,
        bookings: pending.map((b) => ({
          id: b.id,
          bookingRef: b.bookingRef,
          guestName: b.guestName,
          guestEmail: b.guestEmail,
          seats: b.seats,
          balanceCents: b.totalCents - b.refundedCents,
          currencyCode: b.currencyCode,
          canRebook: !b.channelId,
          notice: notice.get(`weather_cancellation:${b.id}`) || "none",
          options: (options2.get(d.tourId) || []).filter((o) => o.remaining >= (b.seats || 1))
        }))
      };
    })
  };
}

// features/keystone/mutations/tour-onboarding.ts
var ENTITIES = ["settings", "paymentProvider", "role", "meetingPoint", "cancellationPolicy", "waiver", "promoCode", "channel", "resource", "guide", "tour"];
async function ensureTourOnboardingRecord(_r, { entity, data }, context) {
  await authorize(context, "canManageOnboarding");
  if (!ENTITIES.includes(entity) || !data || typeof data !== "object") throw new Error("Unsupported setup record");
  const p2 = context.prisma;
  const ensure = async (model, where, create) => await p2[model].findFirst({ where }) || p2[model].create({ data: create });
  switch (entity) {
    // As in E-commerce onboarding: the store always gets a registry logo and hue; seed values win when present.
    case "settings": {
      const row = await ensure("storeSettings", { settingsKey: "operator" }, { logoIcon: DEFAULT_STORE_LOGO_ICON, logoColor: DEFAULT_STORE_LOGO_COLOR, ...data, settingsKey: "operator" });
      return { id: row.id };
    }
    case "paymentProvider": {
      const row = await ensure("paymentProvider", { code: data.code }, { name: data.name, code: data.code, isInstalled: true, credentials: {}, createPaymentFunction: "stripe", capturePaymentFunction: "stripe", refundPaymentFunction: "stripe", getPaymentStatusFunction: "stripe", generatePaymentLinkFunction: "stripe", handleWebhookFunction: "stripe" });
      return { id: row.id };
    }
    case "role": {
      for (const key of data.permissions) if (!permissionNames.includes(key)) throw new Error("Unknown permission");
      const row = await ensure("role", { name: data.name }, { name: data.name, ...Object.fromEntries(data.permissions.map((k) => [k, true])) });
      return { id: row.id };
    }
    case "meetingPoint": {
      const row = await ensure("meetingPoint", { name: data.name }, data);
      return { id: row.id };
    }
    case "cancellationPolicy": {
      const row = await ensure("cancellationPolicy", { name: data.name }, data);
      return { id: row.id };
    }
    case "waiver": {
      const body = [{ type: "paragraph", children: [{ text: data.text }] }];
      const row = await ensure("waiverTemplate", { name: data.name, version: data.version }, { name: data.name, version: data.version, body, bodyHash: hashToken(JSON.stringify(body)), status: "published" });
      return { id: row.id };
    }
    case "promoCode": {
      const row = await ensure("promoCode", { code: data.code }, { ...data, status: "active" });
      return { id: row.id };
    }
    case "channel": {
      const row = await ensure("channel", { name: data.name }, data);
      return { id: row.id };
    }
    case "resource": {
      const row = await ensure("resource", { name: data.name }, { ...data, status: "active" });
      return { id: row.id };
    }
    case "guide": {
      let row = await p2.guide.findFirst({ where: { name: data.name } });
      if (!row) {
        row = await p2.guide.create({ data: { name: data.name, languages: data.languages, payRateType: data.payRateType, payRateCents: data.payRateCents, status: "active", bio: data.bio || "" } });
        for (const cert of data.certs) await p2.guideCertification.create({ data: { guideId: row.id, name: cert, expiresAt: data.expiringCert === cert ? new Date(Date.now() + 20 * 864e5) : new Date(Date.now() + 700 * 864e5) } });
      }
      return { id: row.id };
    }
    case "tour": {
      let tour = await p2.tour.findUnique({ where: { slug: data.slug } });
      if (!tour) {
        tour = await p2.tour.create({ data: {
          name: data.name,
          slug: data.slug,
          kind: data.kind,
          description: data.description,
          durationMinutes: data.durationMinutes,
          minParticipants: data.minParticipants,
          maxParticipants: data.maxParticipants,
          guideRatio: data.guideRatio,
          requiresResourceKind: data.resource,
          minAge: data.minAge || 0,
          status: "active",
          timezone: "America/New_York",
          requiredCertifications: data.certs || [],
          meetingPointId: data.meetingPointId,
          cancellationPolicyId: data.policyId,
          requiresWaiverId: data.waiverId || void 0,
          highlights: [],
          ticketTypes: { create: data.tickets.map((t) => ({ name: t.name, priceCents: t.priceCents, seatsUsed: t.seatsUsed || 1, minAge: t.minAge, maxAge: t.maxAge })) },
          addOns: { create: (data.addOns || []).map((a) => ({ name: a.name, priceCents: a.priceCents, perPerson: a.perPerson })) }
        } });
        await p2.schedule.create({ data: { name: `${data.name} schedule`, tourId: tour.id, rrule: data.rrule, startTimes: data.startTimes } });
      }
      return { id: tour.id };
    }
  }
}
var rand = (seed) => {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
};
async function seedTourActivity(_r, { template, seed }, context) {
  const user = await authorize(context, "canManageOnboarding");
  const p2 = context.prisma;
  const full = template === "full";
  const tours = await p2.tour.findMany({ where: { status: "active" }, include: { schedules: true, ticketTypes: true } });
  const wanted = full ? tours : tours.filter((t) => seed.tours.find((x) => x.slug === t.slug)?.minimal);
  const now = /* @__PURE__ */ new Date();
  const horizon = new Date(now.getTime() + (full ? 21 : 3) * 864e5);
  let created = 0;
  for (const tour of wanted) for (const schedule of tour.schedules) {
    const starts = expandSchedule(schedule, tour, now, horizon).slice(0, full ? 400 : 3);
    for (const startAt of starts) {
      const key = `${tour.id}:${startAt.toISOString()}`;
      if (!await p2.departure.findUnique({ where: { departureKey: key } })) {
        await p2.departure.create({ data: departureData(schedule, tour, startAt, key) });
        created++;
      }
    }
  }
  const departures = await p2.departure.findMany({ where: { startAt: { gt: now }, status: { in: ["on_sale", "confirmed", "min_not_met", "full"] } }, include: { tour: true }, orderBy: { startAt: "asc" }, take: 400 });
  if (!full) return { departures: created, bookings: 0 };
  const guides = await p2.guide.findMany({ orderBy: { name: "asc" } });
  const resources = await p2.resource.findMany();
  let gi = 0;
  const idem = (s) => `seed:${s}`;
  for (const d of departures.slice(0, 60)) {
    try {
      const kind = d.tour.requiresResourceKind;
      const r = resources.find((x) => x.kind === kind);
      if (r) await assignResource(null, { input: { departureId: d.id, resourceId: r.id, quantity: kind === "kayak" ? 8 : 1 }, idempotencyKey: idem(`res:${d.id}`) }, context);
    } catch {
    }
    for (let k = 0; k < 2; k++) {
      const guide = guides[gi++ % guides.length];
      try {
        const offer = await assignGuide(null, { input: { departureId: d.id, guideId: guide.id, role: k === 0 ? "lead" : "assistant" }, idempotencyKey: idem(`guide:${d.id}:${guide.id}`) }, context);
        if (k === 0 || d.startAt.getTime() % 3 === 0) await respondToAssignment(null, { input: { assignmentId: offer.id, status: "accepted" }, idempotencyKey: idem(`accept:${offer.id}`) }, { ...context, session: { ...context.session, itemId: user.id } });
      } catch {
      }
    }
  }
  const next = rand(7);
  let bookings = 0;
  const sources = ["phone", "walk_up", "reseller", "phone", "walk_up"];
  const channels = await p2.channel.findMany();
  const names = seed.guestNames;
  const sellable = departures.filter((d) => d.tour.slug !== "private-ghost-tour" || next() > 0.5);
  for (let n = 0; bookings < (seed.bookingTarget || 60) && n < 400; n++) {
    const d = sellable[Math.floor(next() * Math.min(sellable.length, 90))];
    if (!d) break;
    const tickets = await p2.ticketType.findMany({ where: { tourId: d.tourId } });
    const t = tickets[Math.floor(next() * tickets.length)];
    const qty = 1 + Math.floor(next() * 3);
    const name3 = names[Math.floor(next() * names.length)];
    const source = sources[Math.floor(next() * sources.length)];
    const channel = source === "reseller" ? channels[Math.floor(next() * channels.length)] : null;
    try {
      await createChannelBooking(null, { idempotencyKey: idem(`booking:${n}`), input: { departureId: d.id, source, channelId: channel?.id, paymentMethod: "cash", tickets: [{ id: t.id, qty }], lead: { name: name3, email: `${name3.toLowerCase().replace(/[^a-z]+/g, ".")}@guests.example`, phone: "843-555-0100" }, participants: Array.from({ length: qty }, (_, i) => ({ ticketTypeId: t.id, fullName: i === 0 ? name3 : `${name3.split(" ")[0]} Guest ${i}`, age: t.minAge ? Math.max(t.minAge, 30) : 35 })) } }, context);
      bookings++;
    } catch {
    }
  }
  const soon = await p2.participant.findMany({ where: { booking: { status: "confirmed", departure: { startAt: { lt: new Date(now.getTime() + 36 * 36e5) } } } }, take: 6 });
  for (const part of soon) {
    try {
      await checkInParticipant(null, { input: { participantId: part.id }, idempotencyKey: idem(`ci:${part.id}`) }, context);
    } catch {
    }
  }
  const cancelDep = sellable.find((d) => d.startAt.getTime() - now.getTime() > 6 * 864e5 && d.tour.slug !== "dolphin-boat") || sellable[sellable.length - 1];
  if (cancelDep) {
    try {
      const t = (await p2.ticketType.findMany({ where: { tourId: cancelDep.tourId } }))[0];
      const made = await createChannelBooking(null, { idempotencyKey: idem("cancelled-sale"), input: { departureId: cancelDep.id, source: "phone", paymentMethod: "cash", tickets: [{ id: t.id, qty: 2 }], lead: { name: names[3 % names.length], email: "cancelled.guest@guests.example", phone: "843-555-0111" }, participants: [0, 1].map((k) => ({ ticketTypeId: t.id, fullName: `${names[3 % names.length]} ${k}`, age: 30 })) } }, context);
      const booking = await p2.booking.findUnique({ where: { bookingRef: made.bookingRef } });
      await refundBooking(null, { input: { bookingId: booking.id, amountCents: booking.totalCents, reason: "Guest cancelled: change of plans", cancelBooking: true }, idempotencyKey: idem("cancelled-sale-refund") }, context);
    } catch {
    }
  }
  const target = departures.find((d) => d.tour.slug === "dolphin-boat" && d.startAt.getTime() - now.getTime() > 5 * 864e5);
  if (target) {
    for (let i = 0; i < 3; i++) {
      const t = (await p2.ticketType.findMany({ where: { tourId: target.tourId } }))[0];
      try {
        await createChannelBooking(null, { idempotencyKey: idem(`weather:${i}`), input: { departureId: target.id, source: "phone", paymentMethod: "cash", tickets: [{ id: t.id, qty: 2 }], lead: { name: names[i], email: `weather${i}@guests.example` }, participants: [0, 1].map((k) => ({ ticketTypeId: t.id, fullName: `${names[i]} ${k}`, age: 30 })) } }, context);
      } catch {
      }
    }
    await weatherCancelDeparture(null, { input: { departureId: target.id, reason: "Small-craft advisory: sustained 25 kt winds forecast on the harbor" }, idempotencyKey: idem("weather-cancel") }, context);
  }
  const history = tours.slice(0, 4);
  for (let h = 0; h < history.length; h++) {
    const tour = history[h];
    const startAt = new Date(now.getTime() - (h + 2) * 864e5);
    startAt.setMinutes(0, 0, 0);
    const key = `history:${tour.id}:${startAt.toISOString()}`;
    if (await p2.departure.findUnique({ where: { departureKey: key } })) continue;
    const dep = await p2.departure.create({ data: { departureKey: key, tourId: tour.id, startAt, endAt: new Date(startAt.getTime() + tour.durationMinutes * 6e4), capacity: tour.maxParticipants, status: "completed" } });
    const guide = guides[h % guides.length];
    const payout = await p2.guidePayout.create({ data: { guideId: guide.id, periodStart: dep.startAt, periodEnd: dep.endAt, totalCents: guide.payRateCents, status: "draft" } });
    await p2.guideAssignment.create({ data: { departureId: dep.id, guideId: guide.id, role: "lead", status: "worked", payCents: guide.payRateCents, payoutId: payout.id } });
    const ticket = tour.ticketTypes[0];
    for (let b = 0; b < 2; b++) {
      const total = ticket.priceCents * 2;
      const booking = await p2.booking.create({ data: { bookingRef: `TG-${humanCode(8)}`, departureId: dep.id, guestName: names[(h * 2 + b) % names.length], guestEmail: `past${h}${b}@guests.example`, status: "completed", source: "phone", subtotalCents: total, totalCents: total, seats: 2 * ticket.seatsUsed, policySnapshot: { rules: [] }, tourSnapshot: { name: tour.name, timezone: tour.timezone }, lines: { create: [{ name: ticket.name, unitPriceCents: ticket.priceCents, qty: 2, seatsUsed: ticket.seatsUsed, kind: "ticket", totalCents: total, catalogId: ticket.id }] } } });
      for (let k = 0; k < 2; k++) await p2.participant.create({ data: { bookingId: booking.id, fullName: `${booking.guestName} ${k}`, waiverStatus: "not_required", checkInStatus: "checked_in", ticketTypeSnapshot: { name: ticket.name } } });
      await p2.payment.create({ data: { idempotencyKey: `seed-history:${booking.id}`, amount: total, status: "succeeded", paymentMethod: "cash", orderId: booking.id, processedAt: startAt, notes: "Collected by operator" } });
    }
  }
  await p2.$transaction((tx) => audit(tx, user.id, "onboarding.activity_seeded", "Departure", "seed", null, { bookings }));
  return { departures: created, bookings };
}

// features/keystone/mutations/tour-guide-day.ts
var LIVE3 = ["confirmed", "checked_in", "completed", "no_show", "partially_refunded"];
var WORKING = ["accepted", "worked"];
var DAY = (d, tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
async function zone(db) {
  return (await db.storeSettings.findFirst({ select: { timezone: true } }))?.timezone || "America/New_York";
}
async function myDepartures(_r, args, context) {
  const user = await authorize(context, "canCheckIn");
  try {
    const db = context.prisma, tz = await zone(db);
    const guide = await db.guide.findUnique({ where: { userId: user.id }, select: { id: true, name: true } });
    if (!guide) return { guide: null, departures: [] };
    const days = Math.min(Math.max(Number(args.days) || 14, 1), 60);
    const from = zonedStart(DAY(/* @__PURE__ */ new Date(), tz), "00:00", tz), to = new Date(from.getTime() + days * 864e5);
    const assignments = await db.guideAssignment.findMany({
      where: { guideId: guide.id, status: { in: WORKING }, departure: { startAt: { gte: from, lt: to }, status: { notIn: ["cancelled", "weather_cancelled"] } } },
      orderBy: { departure: { startAt: "asc" } },
      take: 100,
      include: { departure: { include: { tour: { select: { name: true, meetingPoint: { select: { name: true, instructions: true } } } } } } }
    });
    const out = [];
    for (const a of assignments) {
      const d = a.departure;
      const [agg, gaps] = await Promise.all([
        db.booking.aggregate({ where: { departureId: d.id, status: { in: LIVE3 } }, _sum: { seats: true }, _count: true }),
        db.participant.count({ where: { waiverStatus: "required", booking: { departureId: d.id, status: { in: LIVE3 } } } })
      ]);
      out.push({ id: d.id, startAt: d.startAt, endAt: d.endAt, status: d.status, tourName: d.tour.name, meetingPoint: d.tour.meetingPoint?.name || null, role: a.role, assignmentStatus: a.status, guests: agg._sum.seats || 0, bookings: agg._count, waiverGaps: gaps });
    }
    return { guide, departures: out };
  } catch (e) {
    throw userFacingError(e);
  }
}
var PICKUP_SELECT = { bookingRef: true, guestName: true, guestPhone: true, pickupLocation: true, specialRequests: true, seats: true, departureId: true, participants: { select: { fullName: true }, orderBy: { fullName: "asc" } } };
function stopsFrom(bookings) {
  const stops = /* @__PURE__ */ new Map();
  for (const b of bookings) {
    const name3 = (b.pickupLocation || "").trim() || "Meet at the meeting point";
    if (!stops.has(name3)) stops.set(name3, { name: name3, guests: 0, bookings: [] });
    const s = stops.get(name3);
    s.guests += b.seats || 0;
    s.bookings.push({ bookingRef: b.bookingRef, leadName: b.guestName, phone: b.guestPhone || "", partySize: b.seats || 0, names: b.participants.map((p2) => p2.fullName).filter(Boolean), notes: (b.specialRequests || "").trim() });
  }
  return [...stops.values()].sort((a, b) => (a.name.startsWith("Meet at") ? 1 : 0) - (b.name.startsWith("Meet at") ? 1 : 0) || a.name.localeCompare(b.name));
}
async function pickupSheet(_r, args, context) {
  const user = await authorize(context, "canCheckIn");
  try {
    const db = context.prisma;
    const d = await db.departure.findUnique({ where: { id: String(args.departureId || "") }, include: { tour: { select: { name: true, meetingPoint: { select: { name: true, address: true, instructions: true } } } }, assignedGuides: { include: { guide: { select: { name: true, userId: true } } } } } });
    if (!d) throw new Error("Departure not found");
    await assertDepartureAccess(db, user, d.id);
    const bookings = await db.booking.findMany({ where: { departureId: d.id, status: { in: LIVE3 } }, orderBy: [{ pickupLocation: "asc" }, { bookingRef: "asc" }], select: PICKUP_SELECT });
    const list14 = stopsFrom(bookings);
    return { departure: { id: d.id, startAt: d.startAt, tourName: d.tour.name, meetingPoint: d.tour.meetingPoint || null, guides: d.assignedGuides.filter((a) => WORKING.includes(a.status)).map((a) => a.guide?.name).filter(Boolean) }, totalGuests: list14.reduce((n, s) => n + s.guests, 0), stops: list14 };
  } catch (e) {
    throw userFacingError(e);
  }
}
async function dayPickupSheet(_r, args, context) {
  const user = await authorize(context, "canCheckIn");
  try {
    const db = context.prisma, tz = await zone(db), day = String(args.day || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Choose a day");
    const next = /* @__PURE__ */ new Date(`${day}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const from = zonedStart(day, "00:00", tz), to = zonedStart(next.toISOString().slice(0, 10), "00:00", tz);
    const scope = await scopedDepartureFilter(db, user);
    const deps = await db.departure.findMany({ where: { startAt: { gte: from, lt: to }, status: { notIn: ["cancelled", "weather_cancelled"] }, ...scope || {} }, orderBy: { startAt: "asc" }, take: 60, include: { tour: { select: { name: true, meetingPoint: { select: { name: true, address: true } } } }, assignedGuides: { include: { guide: { select: { name: true } } } } } });
    const bookings = deps.length ? await db.booking.findMany({ where: { departureId: { in: deps.map((d) => d.id) }, status: { in: LIVE3 } }, orderBy: [{ pickupLocation: "asc" }, { bookingRef: "asc" }], select: PICKUP_SELECT }) : [];
    const departures = deps.map((d) => {
      const stops = stopsFrom(bookings.filter((b) => b.departureId === d.id));
      return { id: d.id, startAt: d.startAt, tourName: d.tour.name, meetingPoint: d.tour.meetingPoint || null, guides: d.assignedGuides.filter((a) => WORKING.includes(a.status)).map((a) => a.guide?.name).filter(Boolean), totalGuests: stops.reduce((n, s) => n + s.guests, 0), stops };
    });
    return { day, timezone: tz, totalGuests: departures.reduce((n, d) => n + d.totalGuests, 0), departures };
  } catch (e) {
    throw userFacingError(e);
  }
}

// features/keystone/lib/tour-reports.ts
var COUNTED_STATUSES = ["confirmed", "checked_in", "completed", "no_show", "refunded", "partially_refunded"];
function commissionFor(b) {
  if (!b.hasChannel || !b.totalCents) return 0;
  const bps = Math.min(1e4, Math.round(b.channelCommissionCents * 1e4 / b.totalCents));
  return settlement(Math.max(0, b.totalCents - b.refundedCents), bps).commissionCents;
}
var empty = () => ({ bookings: 0, cancelled: 0, guests: 0, grossCents: 0, discountCents: 0, refundedCents: 0, netCents: 0, commissionCents: 0 });
function add(t, r) {
  t.bookings += 1;
  if (isCancelled(r.status)) t.cancelled += 1;
  t.guests += r.guests;
  t.grossCents += r.grossCents;
  t.discountCents += r.discountCents;
  t.refundedCents += r.refundedCents;
  t.netCents += r.grossCents - r.refundedCents;
  t.commissionCents += r.commissionCents;
}
var isCancelled = (status) => status === "cancelled" || status === "refunded";
var cancellationBps = (t) => t.bookings ? Math.round(t.cancelled * 1e4 / t.bookings) : 0;
function weekStart(day) {
  const d = /* @__PURE__ */ new Date(`${day}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * 864e5).toISOString().slice(0, 10);
}
function weeklyTrend(rows, from, to) {
  const by = /* @__PURE__ */ new Map();
  for (let w = weekStart(from); w <= to; w = new Date((/* @__PURE__ */ new Date(`${w}T12:00:00Z`)).getTime() + 7 * 864e5).toISOString().slice(0, 10)) by.set(w, { week: w, bookings: 0, netCents: 0 });
  for (const r of rows) {
    const w = by.get(weekStart(r.day));
    if (w) {
      w.bookings += 1;
      w.netCents += r.grossCents - r.refundedCents;
    }
  }
  return [...by.values()];
}
var occBps = (seats, capacity) => capacity ? Math.round(Math.min(seats, capacity) * 1e4 / capacity) : 0;
function occupancy2(deps) {
  const by = /* @__PURE__ */ new Map();
  const total = { name: "All tours", departures: 0, capacity: 0, seats: 0, bps: 0 };
  for (const d of deps) for (const o of [total, by.get(d.tour) || (by.set(d.tour, { name: d.tour, departures: 0, capacity: 0, seats: 0, bps: 0 }), by.get(d.tour))]) {
    o.departures += 1;
    o.capacity += d.capacity;
    o.seats += d.seats;
  }
  const byTour = [...by.values()].map((o) => ({ ...o, bps: occBps(o.seats, o.capacity) })).sort((a, b) => b.bps - a.bps || a.name.localeCompare(b.name));
  return { total: { ...total, bps: occBps(total.seats, total.capacity) }, byTour, departures: deps.map((d) => ({ ...d, bps: occBps(d.seats, d.capacity) })) };
}
function summarize(rows) {
  const totals = empty();
  const maps = { tour: /* @__PURE__ */ new Map(), channel: /* @__PURE__ */ new Map(), source: /* @__PURE__ */ new Map() };
  for (const r of rows) {
    add(totals, r);
    for (const k of ["tour", "channel", "source"]) {
      const name3 = r[k];
      if (!maps[k].has(name3)) maps[k].set(name3, { name: name3, ...empty() });
      add(maps[k].get(name3), r);
    }
  }
  const sorted = (m) => [...m.values()].sort((a, b) => b.grossCents - a.grossCents || a.name.localeCompare(b.name));
  return { totals: { ...totals, cancellationBps: cancellationBps(totals) }, byTour: sorted(maps.tour), byChannel: sorted(maps.channel), bySource: sorted(maps.source) };
}
function csvText(value) {
  let s = String(value ?? "").replace(/\r?\n/g, " ");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
var dollars = (cents) => {
  if (!Number.isInteger(cents) || cents < 0) throw new Error("Report amounts must be non-negative whole cents");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
};
var HEAD = ["Booking", "Booked", "Departure", "Tour", "Channel", "Source", "Status", "Guests", "Gross", "Discounts", "Refunds", "Net", "Channel commission"];
function salesCsv(rows) {
  const t = summarize(rows).totals;
  const lines = [HEAD.join(",")];
  for (const r of rows) lines.push([csvText(r.ref), csvText(r.bookedAt), csvText(r.departureAt), csvText(r.tour), csvText(r.channel), csvText(r.source), csvText(r.status), r.guests, dollars(r.grossCents), dollars(r.discountCents), dollars(r.refundedCents), dollars(r.grossCents - r.refundedCents), dollars(r.commissionCents)].join(","));
  lines.push(["TOTAL", "", "", "", "", "", `${t.bookings} bookings; ${t.cancelled} cancelled`, t.guests, dollars(t.grossCents), dollars(t.discountCents), dollars(t.refundedCents), dollars(t.netCents), dollars(t.commissionCents)].join(","));
  return lines.join("\r\n") + "\r\n";
}

// features/keystone/mutations/tour-reports.ts
var MAX_ROWS = 2e4;
var MAX_DAYS = 400;
var DAY2 = /^\d{4}-\d{2}-\d{2}$/;
var plusDay = (d, n) => new Date((/* @__PURE__ */ new Date(`${d}T12:00:00Z`)).getTime() + n * 864e5).toISOString().slice(0, 10);
async function buildRows(context, input) {
  const from = String(input?.from || ""), to = String(input?.to || "");
  if (!DAY2.test(from) || !DAY2.test(to)) throw new Error("Choose a start and end date");
  if (to < from) throw new Error("The end date is before the start date");
  if ((Date.parse(to) - Date.parse(from)) / 864e5 > MAX_DAYS) throw new Error("Choose a range of 400 days or less");
  const basis = input?.basis === "departure" ? "departure" : "booked";
  const settings = await context.prisma.storeSettings.findFirst({ select: { timezone: true } });
  const tz = settings?.timezone || "America/New_York";
  const start = zonedStart(from, "00:00", tz), end = zonedStart(plusDay(to, 1), "00:00", tz);
  const range = { gte: start, lt: end };
  const sold = { OR: [{ status: { in: COUNTED_STATUSES } }, { status: "cancelled", creditUsedAt: null, rebookCreditHash: null, OR: [{ channelId: { not: null } }, { payments: { some: { status: { in: ["succeeded", "refunded", "partially_refunded"] } } } }] }] };
  const where = { AND: [sold, basis === "booked" ? { createdAt: range } : { departure: { startAt: range } }] };
  const found = await context.prisma.booking.findMany({
    where,
    orderBy: [{ createdAt: "asc" }, { bookingRef: "asc" }],
    take: MAX_ROWS + 1,
    select: { bookingRef: true, createdAt: true, status: true, source: true, seats: true, totalCents: true, discountCents: true, refundedCents: true, channelCommissionCents: true, channelId: true, channel: { select: { name: true } }, tourSnapshot: true, departure: { select: { startAt: true, tour: { select: { name: true } } } } }
  });
  if (found.length > MAX_ROWS) throw new Error("Too many bookings in that range; choose a shorter range");
  const dayOf2 = new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  const rows = found.map((b) => {
    const total = b.totalCents || 0, refunded = Math.min(b.refundedCents || 0, total);
    return {
      day: dayOf2.format(basis === "booked" || !b.departure?.startAt ? b.createdAt : b.departure.startAt),
      ref: b.bookingRef,
      bookedAt: b.createdAt.toISOString().slice(0, 10),
      departureAt: b.departure?.startAt ? b.departure.startAt.toISOString().slice(0, 16).replace("T", " ") + "Z" : "",
      tour: b.departure?.tour?.name || b.tourSnapshot?.name || "Unknown tour",
      channel: b.channel?.name || "Direct",
      source: b.source || "online",
      status: b.status,
      guests: b.seats || 0,
      grossCents: total,
      discountCents: b.discountCents || 0,
      refundedCents: refunded,
      commissionCents: commissionFor({ totalCents: total, refundedCents: refunded, channelCommissionCents: b.channelCommissionCents || 0, hasChannel: !!b.channelId })
    };
  });
  return { rows, from, to, basis, tz, range };
}
async function buildOccupancy(context, range) {
  const db = context.prisma;
  const deps = await db.departure.findMany({ where: { startAt: range, status: { notIn: ["cancelled", "weather_cancelled"] } }, orderBy: { startAt: "asc" }, take: 5001, select: { id: true, startAt: true, capacity: true, tour: { select: { name: true } } } });
  if (deps.length > 5e3) throw new Error("Too many departures in that range; choose a shorter range");
  const sums = deps.length ? await db.booking.groupBy({ by: ["departureId"], where: { departureId: { in: deps.map((d) => d.id) }, status: { in: ["confirmed", "checked_in", "completed", "no_show", "partially_refunded"] } }, _sum: { seats: true } }) : [];
  const seats = new Map(sums.map((s) => [s.departureId, s._sum.seats || 0]));
  const list14 = deps.map((d) => ({ id: d.id, startAt: d.startAt.toISOString(), tour: d.tour?.name || "Unknown tour", capacity: d.capacity || 0, seats: seats.get(d.id) || 0 }));
  const o = occupancy2(list14);
  return { total: o.total, byTour: o.byTour, departures: o.departures.slice(0, 60), departuresShown: Math.min(60, o.departures.length), departuresTotal: o.departures.length };
}
async function salesReport(_r, args, context) {
  await authorize(context, "canReadPayments");
  try {
    const { rows, from, to, basis, tz, range } = await buildRows(context, args);
    return { from, to, basis, timezone: tz, ...summarize(rows), trend: weeklyTrend(rows, from, to), occupancy: await buildOccupancy(context, range) };
  } catch (e) {
    throw userFacingError(e);
  }
}
async function exportSalesCsv(_r, args, context) {
  const user = await authorize(context, "canReadPayments");
  try {
    const { rows, from, to, basis } = await buildRows(context, args.input);
    const csv = salesCsv(rows);
    const t = summarize(rows).totals;
    await audit(context.prisma, user.id, "report.sales_exported", "Report", `sales:${from}:${to}:${basis}`, null, { from, to, basis, rows: rows.length, ...t }, "Sales CSV export");
    return { filename: `sales-${from}-to-${to}.csv`, csv, rows: rows.length, totals: t };
  } catch (e) {
    throw userFacingError(e);
  }
}

// features/keystone/mutations/tour-waiver-capture.ts
var import_node_crypto8 = require("node:crypto");
var LIVE4 = ["confirmed", "checked_in"];
async function load(context, participantId) {
  const participant = await context.prisma.participant.findUnique({ where: { id: participantId }, include: { booking: true } });
  if (!participant) throw new Error("Participant not found");
  if (participant.waiverStatus === "not_required") throw new Error("This tour does not require a waiver");
  const templateId = participant.booking.tourSnapshot?.waiverTemplateId;
  const template = templateId && await context.prisma.waiverTemplate.findUnique({ where: { id: templateId } });
  if (!template || template.status !== "published") throw new Error("Waiver unavailable: publish the waiver version first");
  return { participant, template };
}
async function participantWaiver(_r, args, context) {
  const actor = await authorize(context, "canCheckIn");
  try {
    const { participant, template } = await load(context, String(args.participantId));
    await assertDepartureAccess(context.prisma, actor, participant.booking.departureId);
    return { participantId: participant.id, participantName: participant.fullName, age: participant.age, status: participant.waiverStatus, name: template.name, version: template.version, text: plainText(template.body) };
  } catch (e) {
    throw userFacingError(e);
  }
}
async function captureWaiverOnSite(_r, args, context) {
  const user = await authorize(context, "canCheckIn");
  const i = args.input;
  try {
    const signerName = String(i.signerName || "").trim();
    if (!signerName) throw new Error("The signer must type their name");
    if (signerName.length > 200) throw new Error("Signer name is too long");
    const { participant, template } = await load(context, String(i.participantId));
    await assertDepartureAccess(context.prisma, user, participant.booking.departureId);
    if (!LIVE4.includes(participant.booking.status)) throw new Error("Booking is not confirmed");
    const bodyHash = (0, import_node_crypto8.createHash)("sha256").update(JSON.stringify(template.body)).digest("hex");
    return await command(context, args.idempotencyKey, "captureWaiverOnSite", { participantId: participant.id, signerName, isGuardian: !!i.isGuardian }, [`participant:${participant.id}`], async (tx) => {
      const current = await tx.participant.findUnique({ where: { id: participant.id }, select: { waiverStatus: true } });
      if (current.waiverStatus === "signed") return { signed: true, alreadySigned: true };
      await tx.waiverSignature.create({ data: { participantId: participant.id, templateId: template.id, templateVersion: template.version, signerName, isGuardian: !!i.isGuardian, minorName: i.isGuardian ? participant.fullName : "", signedAt: /* @__PURE__ */ new Date(), ip: "", userAgent: `staff-assisted:${user.id}`, bodyHash } });
      await tx.participant.update({ where: { id: participant.id }, data: { waiverStatus: "signed" } });
      await audit(tx, user.id, "waiver.captured_on_site", "Participant", participant.id, { waiverStatus: current.waiverStatus }, { waiverStatus: "signed", signerName, isGuardian: !!i.isGuardian, templateVersion: template.version }, "Signed on staff device at check-in", args.idempotencyKey);
      return { signed: true, alreadySigned: false };
    });
  } catch (e) {
    throw userFacingError(e);
  }
}

// features/keystone/mutations/tour-self-service.ts
var import_node_crypto9 = require("node:crypto");

// features/keystone/lib/tour-self-service.ts
function selfServiceWindow(startAt, cutoffMinutes, now = /* @__PURE__ */ new Date()) {
  const closesAt = new Date(new Date(startAt).getTime() - (cutoffMinutes ?? 0) * 6e4);
  return { closesAt, open: closesAt.getTime() > now.getTime() };
}
function describePolicy(rules2) {
  const sorted = [...rules2 || []].sort((a, b) => b.hoursBefore - a.hoursBefore);
  if (!sorted.length) return ["No refund once booked"];
  const pct = (bps) => bps >= 1e4 ? "Full refund" : bps <= 0 ? "No refund" : `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}% refund`;
  const hours = (h) => h === 1 ? "1 hour" : h % 24 === 0 && h >= 48 ? `${h / 24} days` : `${h} hours`;
  const lines = sorted.filter((r) => r.hoursBefore > 0).map((r) => `${pct(r.refundBps)} up to ${hours(r.hoursBefore)} before the start`);
  const last = sorted.find((r) => r.hoursBefore === 0);
  lines.push(last ? `${pct(last.refundBps)} after that` : "No refund after that");
  return lines;
}
var samePrice = (a, b) => a.subtotalCents === b.subtotalCents && a.addOnsCents === b.addOnsCents;
var manageLinkPath = (bookingRef, token) => `/manage#${bookingRef}.${token}`;

// features/keystone/mutations/tour-self-service.ts
var OPEN_FOR_SALE2 = ["on_sale", "confirmed", "min_not_met"];
var norm3 = (s) => String(s || "").trim().toUpperCase();
function assertManageProof(booking, token) {
  const expected = Buffer.from(manageToken(booking.id, booking.manageTokenVersion || 0)), given = Buffer.from(String(token || ""));
  if (!booking || given.length !== expected.length || !(0, import_node_crypto9.timingSafeEqual)(expected, given)) throw new Error("Booking not found");
}
async function load2(db, args) {
  const booking = await db.booking.findUnique({ where: { bookingRef: norm3(args.bookingRef) }, include: { departure: { include: { tour: { include: { meetingPoint: true } } } }, lines: true, participants: { select: { id: true, fullName: true, waiverStatus: true, checkInStatus: true, ticketTypeSnapshot: true } } } });
  if (!booking) throw new Error("Booking not found");
  assertManageProof(booking, args.token);
  if (booking.departure.endAt.getTime() <= Date.now()) throw new Error("This link has expired. The departure has ended.");
  return booking;
}
var stage = (b, window2) => !["confirmed"].includes(b.status) ? { can: false, why: b.status === "cancelled" || b.status === "refunded" ? "This booking is cancelled." : "This booking can no longer be changed online. Contact the operator." } : b.channelId ? { can: false, why: "This booking was made through a reseller. Contact them or the operator to change it." } : !window2.open ? { can: false, why: "Online changes closed before the start. Contact the operator." } : { can: true, why: "" };
async function priceOn(db, b, d) {
  const rules2 = await db.pricingRule.findMany({ where: { tourId: d.tourId } });
  const tickets = await db.ticketType.findMany({ where: { id: { in: b.lines.filter((l) => l.kind === "ticket").map((l) => l.catalogId) }, active: true } });
  const addOns = await db.addOn.findMany({ where: { id: { in: b.lines.filter((l) => l.kind === "addon").map((l) => l.catalogId) } } });
  return priceWith(b, d, rules2, tickets, addOns);
}
function priceWith(b, d, rules2, tickets, addOns) {
  const tz = b.departure?.tour?.timezone || "America/New_York";
  let subtotalCents = 0, addOnsCents = 0;
  for (const l of b.lines) {
    if (l.kind === "ticket") {
      const t = tickets.find((x) => x.id === l.catalogId);
      if (!t) return null;
      subtotalCents += applyPricingRules(t.priceCents, t.id, d.startAt, tz, rules2).unitPriceCents * l.qty;
    } else {
      const a = addOns.find((x) => x.id === l.catalogId);
      if (!a) return null;
      addOnsCents += a.priceCents * l.qty;
    }
  }
  return { subtotalCents, addOnsCents };
}
async function options(db, b) {
  const now = /* @__PURE__ */ new Date();
  const deps = await db.departure.findMany({ where: { tourId: b.departure.tourId, id: { not: b.departureId }, status: { in: OPEN_FOR_SALE2 }, startAt: { gt: now, lt: new Date(+now + 120 * 864e5) } }, orderBy: { startAt: "asc" }, take: 40 });
  const rules2 = await db.pricingRule.findMany({ where: { tourId: b.departure.tourId } });
  const tickets = await db.ticketType.findMany({ where: { id: { in: b.lines.filter((l) => l.kind === "ticket").map((l) => l.catalogId) }, active: true } });
  const addOns = await db.addOn.findMany({ where: { id: { in: b.lines.filter((l) => l.kind === "addon").map((l) => l.catalogId) } } });
  const out = [], priced = [];
  for (const d of deps) {
    if (!selfServiceWindow(d.startAt, d.bookingCutoffMinutes, now).open) continue;
    const price = priceWith(b, d, rules2, tickets, addOns);
    if (!price || !samePrice(price, b)) continue;
    priced.push(d);
  }
  if (!priced.length) return out;
  const ids = priced.map((d) => d.id), LIVE6 = ["confirmed", "checked_in", "completed", "no_show"];
  const [booked, held, channels, channelSold] = await Promise.all([
    db.booking.groupBy({ by: ["departureId"], where: { departureId: { in: ids }, status: { in: LIVE6 } }, _sum: { seats: true } }),
    db.inventoryHold.groupBy({ by: ["departureId"], where: { departureId: { in: ids }, status: "active", expiresAt: { gt: now } }, _sum: { quantity: true } }),
    db.channel.findMany({ where: { active: true, allocation: { gt: 0 } } }),
    db.booking.groupBy({ by: ["departureId", "channelId"], where: { departureId: { in: ids }, channelId: { not: null }, status: { in: LIVE6 } }, _sum: { seats: true } })
  ]);
  const sum = (rows, id, k) => rows.find((r) => r.departureId === id)?._sum[k] || 0;
  for (const d of priced) {
    const far = d.startAt.getTime() - now.getTime() > 864e5;
    const reserved = far ? channels.reduce((n, c) => n + Math.max(0, c.allocation - (channelSold.find((x) => x.departureId === d.id && x.channelId === c.id)?._sum.seats || 0)), 0) : 0;
    const remaining = Math.max(0, d.capacity - sum(booked, d.id, "seats") - sum(held, d.id, "quantity") - reserved);
    if (remaining >= (b.seats || 1)) out.push({ id: d.id, startAt: d.startAt, endAt: d.endAt, remaining });
  }
  return out;
}
async function manageBooking(_r, args, context) {
  try {
    const db = context.prisma, b = await load2(db, args);
    const window2 = selfServiceWindow(b.departure.startAt, b.departure.bookingCutoffMinutes);
    const st = stage(b, window2);
    const rules2 = b.policySnapshot?.rules || [];
    const mp = b.departure.tour.meetingPoint;
    return {
      bookingRef: b.bookingRef,
      status: b.status,
      guestName: b.guestName,
      totalCents: b.totalCents,
      refundedCents: b.refundedCents,
      currencyCode: b.currencyCode,
      seats: b.seats,
      tourName: b.tourSnapshot?.name || b.departure.tour.name,
      startAt: b.departure.startAt,
      timezone: b.tourSnapshot?.timezone || b.departure.tour.timezone,
      meetingPoint: mp ? { name: mp.name, address: mp.address, instructions: mp.instructions } : null,
      lines: b.lines.map((l) => ({ name: l.name, qty: l.qty, kind: l.kind })),
      participants: b.participants.map((p2) => ({ id: p2.id, fullName: p2.fullName, waiverStatus: p2.waiverStatus, ticket: p2.ticketTypeSnapshot?.name || "" })),
      tickets: st.can ? await partyTickets(db, b) : [],
      policy: describePolicy(rules2),
      changesCloseAt: window2.closesAt,
      canChange: st.can,
      reason: st.why,
      refundIfCancelledCents: st.can ? refundPolicyAmount(b.totalCents - b.refundedCents, rules2, (b.departure.startAt.getTime() - Date.now()) / 36e5) : 0,
      options: st.can ? await options(db, b) : []
    };
  } catch (e) {
    throw userFacingError(e);
  }
}
async function partyTickets(db, b) {
  const [tickets, rules2] = await Promise.all([db.ticketType.findMany({ where: { tourId: b.departure.tourId, active: true }, orderBy: { priceCents: "desc" } }), db.pricingRule.findMany({ where: { tourId: b.departure.tourId } })]);
  return tickets.map((t) => ({ id: t.id, name: t.name, unitPriceCents: applyPricingRules(t.priceCents, t.id, b.departure.startAt, b.departure.tour.timezone || "America/New_York", rules2).unitPriceCents, minAge: t.minAge, maxAge: t.maxAge }));
}
async function cancelManagedBooking(_r, args, context) {
  try {
    const db = context.prisma, b = await load2(db, args);
    const key = `selfcancel:${b.id}`;
    const done = await db.auditEvent.findFirst({ where: { action: "booking.cancelled", targetId: b.id, requestId: key }, select: { id: true } });
    if (done) return { bookingRef: b.bookingRef, status: (await db.booking.findUnique({ where: { id: b.id } })).status, refundCents: (await db.refund.findUnique({ where: { idempotencyKey: key } }))?.amount || 0, replay: true };
    const st = stage(b, selfServiceWindow(b.departure.startAt, b.departure.bookingCutoffMinutes));
    if (!st.can) throw new Error(st.why);
    const amount = refundPolicyAmount(b.totalCents - b.refundedCents, b.policySnapshot?.rules || [], (b.departure.startAt.getTime() - Date.now()) / 36e5);
    const share = b.totalCents ? Math.round(amount * 100 / (b.totalCents - b.refundedCents || 1)) : 0;
    await issueRefund(db, { bookingId: b.id, amount, reason: `Guest cancelled via manage link under the published policy (${share}% refunded)`, key, actorId: null, cancel: true });
    const after = await db.booking.findUnique({ where: { id: b.id } });
    return { bookingRef: b.bookingRef, status: after.status, refundCents: amount, replay: false };
  } catch (e) {
    throw userFacingError(e);
  }
}
async function rescheduleManagedBooking(_r, args, context) {
  try {
    const db = context.prisma, b0 = await load2(db, args);
    const targetId = String(args.departureId || "");
    if (!targetId) throw new Error("Choose a departure");
    return await command(context, args.idempotencyKey, "rescheduleManagedBooking", { bookingId: b0.id, departureId: targetId }, [`departure:${b0.departureId}`, `departure:${targetId}`], (tx) => moveInTx(tx, b0, targetId, { actorId: null, action: "booking.self_rescheduled", reason: "Guest rescheduled via manage link at the same price", requestId: args.idempotencyKey, guest: true }));
  } catch (e) {
    throw userFacingError(e);
  }
}
async function moveInTx(tx, b0, targetId, o) {
  const old = await tx.booking.findUnique({ where: { id: b0.id }, select: { id: true, status: true, departureId: true, seats: true, channelId: true, holdId: true, tourSnapshot: true, manageTokenVersion: true } });
  if (old.departureId === targetId) throw new Error("Choose a different departure");
  if (o.guest) {
    const st = stage({ status: old.status, channelId: old.channelId }, selfServiceWindow(b0.departure.startAt, b0.departure.bookingCutoffMinutes));
    if (!st.can) throw new Error(st.why);
  } else {
    if (old.status !== "confirmed") throw new Error("Only a confirmed booking can be moved");
    if (old.channelId) throw new Error("Reseller bookings are changed through the reseller");
    if (b0.departure.startAt.getTime() <= Date.now()) throw new Error("This departure has started. It can no longer be moved");
  }
  if (old.departureId !== b0.departureId) throw new Error("This booking has already been changed");
  const target = await tx.departure.findUnique({ where: { id: targetId }, include: { tour: true } });
  if (!target || target.tourId !== b0.departure.tourId) throw new Error("Choose a departure of the same tour");
  if (target.tour.status !== "active" || !OPEN_FOR_SALE2.includes(target.status) || !selfServiceWindow(target.startAt, target.bookingCutoffMinutes).open) throw new Error("That departure is not open for booking");
  const price = await priceOn(tx, b0, target);
  if (!price || !samePrice(price, b0)) throw new Error(o.guest ? "That departure is priced differently. Choose one at the same price, or cancel under the policy" : "That departure is priced differently. Choose one at the same price, or refund and book again");
  const occ = await occupancyNumbers(tx, target.id, target.startAt);
  if (Math.max(0, target.capacity - occ.booked - occ.held - occ.allocated) < (old.seats || 1)) throw new Error("Not enough seats on that departure");
  const snapshot = { ...old.tourSnapshot || {}, startAt: target.startAt, endAt: target.endAt };
  const moved = await tx.booking.updateMany({ where: { id: old.id, status: "confirmed", departureId: old.departureId }, data: { departureId: target.id, tourSnapshot: snapshot } });
  if (moved.count !== 1) throw new Error("This booking has already been changed");
  if (old.holdId) await tx.inventoryHold.update({ where: { id: old.holdId }, data: { departureId: target.id } });
  await refreshDepartureStatus(tx, old.departureId);
  await refreshDepartureStatus(tx, target.id);
  await promoteWaitlist(tx, old.departureId, o.actorId);
  await audit(tx, o.actorId, o.action, "Booking", old.id, { departureId: old.departureId, startAt: b0.departure.startAt }, { departureId: target.id, startAt: target.startAt, totalCents: b0.totalCents }, o.reason, o.requestId);
  return { bookingRef: b0.bookingRef, previousStartAt: b0.departure.startAt, startAt: target.startAt, manageToken: manageToken(old.id, old.manageTokenVersion || 0) };
}
async function loadForStaff(db, bookingId) {
  const b = await db.booking.findUnique({ where: { id: String(bookingId || "") }, include: { departure: { include: { tour: { include: { meetingPoint: true } } } }, lines: true, participants: { select: { id: true, fullName: true, waiverStatus: true } } } });
  if (!b) throw new Error("Booking not found");
  return b;
}
async function bookingMoveOptions(_r, args, context) {
  try {
    await authorize(context, "canManageBookings");
    const db = context.prisma, b = await loadForStaff(db, args.bookingId);
    if (b.status !== "confirmed" || b.channelId || b.departure.startAt.getTime() <= Date.now()) return { bookingRef: b.bookingRef, canMove: false, options: [] };
    return { bookingRef: b.bookingRef, canMove: true, options: await options(db, b) };
  } catch (e) {
    throw userFacingError(e);
  }
}
async function moveBooking(_r, args, context) {
  try {
    const user = await authorize(context, "canManageBookings");
    const i = args.input || {};
    const reason = String(i.reason || "").trim(), targetId = String(i.departureId || "");
    if (!reason) throw new Error("A reason is required");
    if (!targetId) throw new Error("Choose a departure");
    const b0 = await loadForStaff(context.prisma, i.bookingId);
    return await command(context, args.idempotencyKey, "moveBooking", { bookingId: b0.id, departureId: targetId, reason }, [`departure:${b0.departureId}`, `departure:${targetId}`], (tx) => moveInTx(tx, b0, targetId, { actorId: user.id, action: "booking.moved", reason, requestId: args.idempotencyKey, guest: false }));
  } catch (e) {
    throw userFacingError(e);
  }
}
async function resetGuestLink(_r, args, context) {
  try {
    const user = await authorize(context, "canManageBookings");
    const i = args.input || {};
    const reason = String(i.reason || "").trim();
    if (!reason) throw new Error("A reason is required");
    const booking = await context.prisma.booking.findUnique({ where: { id: String(i.bookingId || "") }, select: { id: true, bookingRef: true, departureId: true } });
    if (!booking) throw new Error("Booking not found");
    return await command(context, args.idempotencyKey, "resetGuestLink", { bookingId: booking.id, reason }, [`departure:${booking.departureId}`], async (tx) => {
      const cur = await tx.booking.findUnique({ where: { id: booking.id }, select: { status: true, channelId: true, manageTokenVersion: true } });
      if (cur.status !== "confirmed") throw new Error("Only a confirmed booking has a guest link to reset");
      if (cur.channelId) throw new Error("Reseller bookings are changed through the reseller");
      const from = cur.manageTokenVersion || 0;
      const bumped = await tx.booking.updateMany({ where: { id: booking.id, OR: [{ manageTokenVersion: from }, ...from === 0 ? [{ manageTokenVersion: null }] : []] }, data: { manageTokenVersion: from + 1 } });
      if (bumped.count !== 1) throw new Error("The link was reset by someone else. Reload and try again");
      await audit(tx, user.id, "booking.guest_link_reset", "Booking", booking.id, { version: from }, { version: from + 1 }, reason, args.idempotencyKey);
      return { bookingRef: booking.bookingRef, version: from + 1, link: manageLinkPath(booking.bookingRef, manageToken(booking.id, from + 1)) };
    });
  } catch (e) {
    throw userFacingError(e);
  }
}

// features/keystone/mutations/tour-notification-queue.ts
async function guestNotifications(_r, args, context) {
  await authorize(context, "canManageBookings");
  const status = ["queued", "suppressed", "all"].includes(args.status) ? args.status : "all";
  const take = Math.min(Math.max(Number(args.take) || 50, 1), 100);
  const from = args.from ? new Date(args.from) : null, to = args.to ? new Date(args.to) : null;
  if (from && !Number.isFinite(+from) || to && !Number.isFinite(+to)) throw new Error("Date range is invalid");
  const db = context.prisma;
  const bookingWhere = {};
  if (args.departureId) bookingWhere.departureId = String(args.departureId);
  if (from || to) bookingWhere.departure = { startAt: { ...from ? { gte: from } : {}, ...to ? { lt: to } : {} } };
  let bookingIds = null;
  if (Object.keys(bookingWhere).length) bookingIds = [
    ...(await db.booking.findMany({ where: bookingWhere, select: { id: true }, take: 2e3 })).map((b) => b.id),
    ...(await db.waitlistEntry.findMany({ where: bookingWhere, select: { id: true }, take: 500 })).map((b) => b.id)
  ];
  const kinds = ["booking_confirmation", "day_before_reminder", "weather_cancellation", "waitlist_offer"];
  const rows = await db.auditEvent.findMany({
    where: {
      targetList: "Notification",
      action: status === "all" ? { in: ["notification.queued", "notification.suppressed"] } : `notification.${status}`,
      ...bookingIds ? { OR: kinds.flatMap((k) => bookingIds.map((id) => ({ targetId: `${k}:${id}` }))).slice(0, 6e3) } : {}
    },
    orderBy: { createdAt: "desc" },
    take
  });
  const ids = [...new Set(rows.map((r) => String(r.targetId).split(":")[1]).filter(Boolean))];
  const bookings = ids.length ? await db.booking.findMany({ where: { id: { in: ids } }, select: { id: true, bookingRef: true, departureId: true, departure: { select: { id: true, startAt: true, tour: { select: { name: true } } } } } }) : [];
  const byId = new Map(bookings.map((b) => [b.id, b]));
  const entryIds = rows.filter((r) => String(r.targetId).startsWith("waitlist_offer:")).map((r) => String(r.targetId).split(":")[1]);
  const entries = entryIds.length ? await db.waitlistEntry.findMany({ where: { id: { in: entryIds } }, select: { id: true, bookingRef: true, departure: { select: { id: true, startAt: true, tour: { select: { name: true } } } } } }) : [];
  for (const e of entries) byId.set(e.id, { ...e, bookingRef: e.bookingRef || "Waitlist" });
  return rows.map((r) => {
    const [kind, bookingId] = String(r.targetId).split(":");
    const b = byId.get(bookingId);
    return {
      id: r.id,
      createdAt: r.createdAt,
      kind,
      status: r.action === "notification.queued" ? "queued" : "suppressed",
      reason: r.reason || "",
      to: r.after?.to || "",
      subject: r.after?.subject || "",
      bookingRef: b?.bookingRef || r.after?.bookingRef || "",
      departureId: b?.departure?.id || null,
      tourName: b?.departure?.tour?.name || "",
      departureStartAt: b?.departure?.startAt || null
    };
  });
}

// features/keystone/mutations/tour-party-change.ts
var import_node_crypto10 = require("node:crypto");

// features/keystone/lib/tour-party-change.ts
function planTicketLines(old, counts, offers) {
  const types = [.../* @__PURE__ */ new Set([...old.map((l) => l.catalogId), ...Object.keys(counts)])];
  const out = [];
  for (const type of types) {
    let need = counts[type] || 0;
    if (!Number.isSafeInteger(need) || need < 0 || need > 100) throw new Error("Invalid quantity");
    const kept = [];
    for (const l of old.filter((l2) => l2.catalogId === type)) {
      if (need <= 0) break;
      const qty = Math.min(l.qty, need);
      kept.push({ ...l, qty });
      need -= qty;
    }
    if (need > 0) {
      const o = offers[type];
      if (!o) throw new Error("That ticket is no longer sold for this tour");
      const same = kept.find((l) => l.unitPriceCents === o.unitPriceCents);
      if (same) same.qty += need;
      else kept.push({ catalogId: type, name: o.name, unitPriceCents: o.unitPriceCents, qty: need, seatsUsed: o.seatsUsed });
    }
    out.push(...kept);
  }
  if (!out.some((l) => l.qty > 0)) throw new Error("At least one person must stay on the booking. To cancel, use Cancel");
  return out;
}
var seatsOf = (lines) => lines.reduce((n, l) => n + l.seatsUsed * l.qty, 0);
function partyTotals(lines, addOnsCents, promo, taxBps) {
  const subtotalCents = lines.reduce((n, l) => n + minor(l.unitPriceCents) * minor(l.qty), 0);
  const base = subtotalCents + minor(addOnsCents);
  const discountCents = !promo ? 0 : promo.discountType === "comp" ? base : promo.discountType === "percent_bps" ? basisPoints(base, promo.value) : Math.min(base, minor(promo.value));
  const taxCents = basisPoints(base - discountCents, taxBps || 0);
  return { subtotalCents, discountCents, taxCents, totalCents: base - discountCents + taxCents };
}
function settleChange(a) {
  const differenceCents = a.after.totalCents - a.before.totalCents;
  if (differenceCents >= 0) return { differenceCents, collectCents: differenceCents, refundCents: 0, keptCents: 0, feeCents: a.oldFeeCents, totalCents: a.oldTotalCents + differenceCents };
  const owed = -differenceCents;
  const refundCents = a.guest ? refundPolicyAmount(owed, a.rules, a.hoursBefore) : owed;
  const keptCents = owed - refundCents;
  return { differenceCents, collectCents: 0, refundCents, keptCents, feeCents: a.oldFeeCents + keptCents, totalCents: a.oldTotalCents - refundCents };
}

// features/keystone/mutations/tour-party-change.ts
var HOLD_MINUTES = 15;
async function bookingFor(db, id) {
  const b = await db.booking.findUnique({ where: { id }, include: { departure: { include: { tour: true } }, lines: true, participants: true } });
  if (!b) throw new Error("Booking not found");
  return b;
}
async function ticketOffers(db, b) {
  const [tickets, rules2] = await Promise.all([
    db.ticketType.findMany({ where: { tourId: b.departure.tourId, active: true }, orderBy: { priceCents: "desc" } }),
    db.pricingRule.findMany({ where: { tourId: b.departure.tourId } })
  ]);
  const tz = b.departure.tour.timezone || "America/New_York";
  return tickets.map((t) => ({ id: t.id, name: t.name, minAge: t.minAge, maxAge: t.maxAge, seatsUsed: t.countsTowardCapacity ? t.seatsUsed : 0, unitPriceCents: applyPricingRules(t.priceCents, t.id, b.departure.startAt, tz, rules2).unitPriceCents }));
}
var typeOf = (p2) => p2.ticketTypeSnapshot?.ticketTypeId || "";
async function pricing(db, b) {
  const [offers, settings] = await Promise.all([ticketOffers(db, b), db.storeSettings.findFirst({ select: { taxBps: true, refundApprovalThresholdCents: true } })]);
  return { offers, settings };
}
function planChange(pr, b, input, guest) {
  const keep = [...new Set((input.keep || []).map(String))];
  const add2 = (input.add || []).slice(0, 50).map((a) => ({ ticketTypeId: String(a.ticketTypeId || ""), fullName: String(a.fullName || "").trim(), age: a.age ?? null }));
  if ((input.add || []).length > 50) throw new Error("Too many people");
  const current = b.participants;
  if (keep.some((id) => !current.some((p2) => p2.id === id))) throw new Error("Someone on this change is not on the booking");
  const removed = current.filter((p2) => !keep.includes(p2.id));
  if (removed.some((p2) => p2.checkInStatus === "checked_in")) throw new Error("A checked-in guest cannot be removed");
  if (!removed.length && !add2.length) throw new Error("Nothing to change");
  const offers = pr.offers;
  for (const a of add2) {
    const t = offers.find((o) => o.id === a.ticketTypeId);
    if (!t) throw new Error("That ticket is no longer sold for this tour");
    if (!a.fullName || a.fullName.length > 120) throw new Error("A name is needed for everyone added");
    if (a.age !== null && (!Number.isSafeInteger(a.age) || a.age < 0 || a.age > 120)) throw new Error("Age must be a whole number");
    if (a.age !== null && (t.minAge != null && a.age < t.minAge || t.maxAge != null && a.age > t.maxAge)) throw new Error(`${a.fullName} does not meet the age range for ${t.name}`);
  }
  const counts = {};
  for (const p2 of current.filter((p3) => keep.includes(p3.id))) counts[typeOf(p2)] = (counts[typeOf(p2)] || 0) + 1;
  for (const a of add2) counts[a.ticketTypeId] = (counts[a.ticketTypeId] || 0) + 1;
  const old = b.lines.filter((l) => l.kind === "ticket").map((l) => ({ catalogId: l.catalogId, name: l.name, unitPriceCents: l.unitPriceCents, qty: l.qty, seatsUsed: l.seatsUsed ?? 1 }));
  const offerMap = Object.fromEntries(offers.map((o) => [o.id, { name: o.name, unitPriceCents: o.unitPriceCents, seatsUsed: o.seatsUsed }]));
  const lines = planTicketLines(old, counts, offerMap);
  const settings = pr.settings;
  const promo = b.tourSnapshot?.promo || null;
  const before = partyTotals(old, b.addOnsCents || 0, promo, settings?.taxBps || 0), after = partyTotals(lines, b.addOnsCents || 0, promo, settings?.taxBps || 0);
  const settle = settleChange({ oldTotalCents: b.totalCents, oldFeeCents: b.feeCents || 0, before, after, guest, rules: b.policySnapshot?.rules || [], hoursBefore: (b.departure.startAt.getTime() - Date.now()) / 36e5 });
  const seats = seatsOf(lines);
  return {
    keep,
    add: add2,
    removed: removed.map((p2) => ({ id: p2.id, fullName: p2.fullName })),
    lines,
    seats,
    seatsBefore: b.seats,
    addSeats: Math.max(0, seats - b.seats),
    totals: { subtotalCents: after.subtotalCents, discountCents: (b.discountCents || 0) + after.discountCents - before.discountCents, taxCents: (b.taxCents || 0) + after.taxCents - before.taxCents, feeCents: settle.feeCents, totalCents: settle.totalCents },
    ...settle,
    refundThresholdCents: settings?.refundApprovalThresholdCents ?? 1e4,
    baseline: { totalCents: b.totalCents, seats: b.seats, departureId: b.departureId, participants: current.map((p2) => p2.id).sort() }
  };
}
var view3 = (P, currencyCode) => ({
  seatsBefore: P.seatsBefore,
  seats: P.seats,
  newTotalCents: P.totals.totalCents,
  differenceCents: P.differenceCents,
  collectCents: P.collectCents,
  refundCents: P.refundCents,
  keptCents: P.keptCents,
  currencyCode,
  removed: P.removed.map((r) => r.fullName),
  added: P.add.map((a) => a.fullName),
  lines: P.lines.map((l) => ({ name: l.name, qty: l.qty, unitPriceCents: l.unitPriceCents }))
});
async function roomFor(tx, b, seats, excludeHoldId) {
  if (seats <= 0) return true;
  const o = await occupancyNumbers(tx, b.departureId, b.departure.startAt, excludeHoldId);
  return Math.max(0, o.capacity - o.booked - o.held - o.allocated) >= seats;
}
var unchanged = (b, base) => b.status === "confirmed" && b.totalCents === base.totalCents && b.seats === base.seats && b.departureId === base.departureId && JSON.stringify(b.participants.map((p2) => p2.id).sort()) === JSON.stringify(base.participants);
async function applyPlan(tx, b, P, actorId, action, reason, requestId) {
  await tx.bookingLine.deleteMany({ where: { bookingId: b.id, kind: "ticket" } });
  await tx.bookingLine.createMany({ data: P.lines.map((l) => ({ bookingId: b.id, name: l.name, unitPriceCents: l.unitPriceCents, qty: l.qty, seatsUsed: l.seatsUsed, kind: "ticket", totalCents: l.unitPriceCents * l.qty, currencyCode: b.currencyCode, catalogId: l.catalogId })) });
  if (P.removed.length) await tx.participant.updateMany({ where: { id: { in: P.removed.map((r) => r.id) }, bookingId: b.id }, data: { bookingId: null } });
  const waiver = !!b.departure.tour.requiresWaiverId;
  const lineFor = (type) => P.lines.find((l) => l.catalogId === type);
  if (P.add.length) await tx.participant.createMany({ data: P.add.map((a) => {
    const l = lineFor(a.ticketTypeId), id = "c" + (0, import_node_crypto10.randomBytes)(12).toString("hex");
    return { id, bookingId: b.id, fullName: a.fullName, age: a.age, ticketTypeSnapshot: { ticketTypeId: a.ticketTypeId, name: l.name, unitPriceCents: l.unitPriceCents }, waiverStatus: waiver ? "required" : "not_required", waiverTokenHash: waiver ? hashToken(derivedToken("waiver", id)) : null };
  }) });
  await tx.booking.update({ where: { id: b.id }, data: { ...P.totals, seats: P.seats } });
  await refreshDepartureStatus(tx, b.departureId);
  if (P.seats < b.seats) await promoteWaitlist(tx, b.departureId, actorId);
  await audit(
    tx,
    actorId,
    action,
    "Booking",
    b.id,
    { seats: b.seats, totalCents: b.totalCents, lines: b.lines.filter((l) => l.kind === "ticket").map((l) => ({ name: l.name, qty: l.qty, unitPriceCents: l.unitPriceCents })) },
    { seats: P.seats, totalCents: P.totals.totalCents, lines: P.lines.map((l) => ({ name: l.name, qty: l.qty, unitPriceCents: l.unitPriceCents })), removed: P.removed.map((r) => r.fullName), added: P.add.map((a) => a.fullName), collectCents: P.collectCents, refundCents: P.refundCents, keptCents: P.keptCents },
    reason,
    requestId
  );
}
async function provider2(db) {
  const p2 = await db.paymentProvider.findFirst({ where: { code: "pp_stripe", isInstalled: true } });
  if (!p2) throw new Error("Card payments are not set up. Contact the operator");
  return p2;
}
async function settleByKey(db, bookingId, key, actorId, reason) {
  const legs = await db.refund.findMany({ where: { orderId: bookingId, ...legWhere(key) }, orderBy: { createdAt: "asc" } });
  if (!legs.length) return null;
  return settleRefund(db, { bookingId, amount: 0, reason, key, actorId, tenderOnly: true }, { legs, replay: true });
}
function guestGuard(b) {
  const st = stage(b, selfServiceWindow(b.departure.startAt, b.departure.bookingCutoffMinutes));
  if (!st.can) throw new Error(st.why);
}
async function partyChangeQuote(_r, args, context) {
  try {
    const db = context.prisma, b0 = await load2(db, args);
    guestGuard(b0);
    const b = await bookingFor(db, b0.id), P = planChange(await pricing(db, b), b, args.input, true);
    return { ...view3(P, b.currencyCode), roomForAdded: await roomFor(db, b, P.addSeats) };
  } catch (e) {
    throw userFacingError(e);
  }
}
async function changeParty(_r, args, context) {
  try {
    const db = context.prisma, b0 = await load2(db, args);
    const done = await db.partyChange.findUnique({ where: { requestKey: `changeParty:${args.idempotencyKey}` } });
    if (done && done.bookingId === b0.id) {
      if (done.status === "pending_payment") return { changeId: done.id, status: done.status, collectCents: done.collectCents, currencyCode: done.currencyCode, ...await paymentFor(db, done.id, b0) };
      const r = done.refundCents > 0 ? await settleByKey(db, b0.id, `party-change:${done.id}`, null, done.reason) : null;
      return { changeId: done.id, status: done.status, refundCents: done.refundCents, keptCents: done.keptCents, currencyCode: done.currencyCode, replay: true, ...r ? { refundStatus: r.status } : {} };
    }
    guestGuard(b0);
    await dropUnpaid(db, b0.id, `changeParty:${args.idempotencyKey}`);
    const pr = await pricing(db, await bookingFor(db, b0.id));
    const result = await command(context, args.idempotencyKey, "changeParty", { bookingId: b0.id, input: args.input }, [`departure:${b0.departureId}`], async (tx) => {
      const b = await bookingFor(tx, b0.id);
      guestGuard(b);
      const open = await tx.partyChange.findFirst({ where: { bookingId: b.id, status: "pending_payment" } });
      if (open && open.expiresAt > /* @__PURE__ */ new Date()) throw new Error("A change is waiting for payment. Finish it or let it lapse first");
      if (open) await expireChange(tx, open, null);
      const P = planChange(pr, b, args.input, true);
      if (!await roomFor(tx, b, P.addSeats)) throw new Error("Not enough seats on this departure for the people added");
      const reason = "Guest changed the party via manage link";
      if (P.collectCents > 0) {
        const expiresAt = new Date(Math.min(Date.now() + HOLD_MINUTES * 6e4, b.departure.startAt.getTime()));
        const hold = P.addSeats > 0 ? await tx.inventoryHold.create({ data: { departureId: b.departureId, quantity: P.addSeats, expiresAt, status: "active", cartTokenHash: hashToken(derivedToken("party-hold", `${b.id}:${args.idempotencyKey}`)), quote: { partyChange: true, bookingId: b.id } } }) : null;
        const change2 = await tx.partyChange.create({ data: { bookingId: b.id, source: "guest", status: "pending_payment", plan: P, differenceCents: P.differenceCents, collectCents: P.collectCents, currencyCode: b.currencyCode, holdId: hold?.id || "", expiresAt, reason, requestKey: `changeParty:${args.idempotencyKey}` } });
        await audit(tx, null, "party_change.requested", "PartyChange", change2.id, null, { collectCents: P.collectCents, addSeats: P.addSeats, holdId: hold?.id || null }, reason, args.idempotencyKey);
        return { changeId: change2.id, status: "pending_payment", collectCents: P.collectCents, currencyCode: b.currencyCode, expiresAt };
      }
      const change = await tx.partyChange.create({ data: { bookingId: b.id, source: "guest", status: "applied", plan: P, differenceCents: P.differenceCents, refundCents: P.refundCents, keptCents: P.keptCents, currencyCode: b.currencyCode, reason, requestKey: `changeParty:${args.idempotencyKey}` } });
      await applyPlan(tx, b, P, null, "booking.party_changed", reason, args.idempotencyKey);
      if (P.refundCents > 0) await reserveRefund(tx, { bookingId: b.id, amount: P.refundCents, reason: `${reason}: difference refunded under the published policy`, key: `party-change:${change.id}`, actorId: null, tenderOnly: true });
      return { changeId: change.id, status: "applied", refundCents: P.refundCents, keptCents: P.keptCents, currencyCode: b.currencyCode };
    });
    if (result.status === "applied" && result.refundCents > 0) {
      const r = await settleByKey(db, b0.id, `party-change:${result.changeId}`, null, "Guest changed the party via manage link");
      return { ...result, refundStatus: r?.status || "succeeded" };
    }
    if (result.status === "pending_payment") return { ...result, ...await paymentFor(db, result.changeId, b0) };
    return result;
  } catch (e) {
    throw userFacingError(e);
  }
}
async function dropUnpaid(db, bookingId, requestKey) {
  const open = await db.partyChange.findFirst({ where: { bookingId, status: "pending_payment", requestKey: { not: requestKey } } });
  if (!open) return;
  if (open.paymentIntentId) {
    const prov = await provider2(db);
    const r = await cancelPayment({ provider: prov, paymentId: open.paymentIntentId, idempotencyKey: `party-change-cancel:${open.id}` });
    if (r?.status === "succeeded") throw new Error("A change is waiting for payment. Finish it or let it lapse first");
  }
  await db.$transaction(async (tx) => {
    const b = await tx.booking.findUnique({ where: { id: bookingId }, select: { departureId: true } });
    await lockTransactionKey(tx, `departure:${b.departureId}`);
    const c = await tx.partyChange.findUnique({ where: { id: open.id } });
    if (c.status === "pending_payment") await expireChange(tx, c, null, "Replaced by a new change before payment");
  }, { timeout: 2e4 });
}
async function paymentFor(db, changeId, b) {
  const change = await db.partyChange.findUnique({ where: { id: changeId } });
  const prov = await provider2(db);
  if (!change.paymentIntentId) {
    const created = await createPayment({ provider: prov, order: { id: b.id, orderNumber: b.bookingRef }, amount: change.collectCents, currency: change.currencyCode, idempotencyKey: `party-change:${change.id}` });
    await db.partyChange.updateMany({ where: { id: change.id, paymentIntentId: "" }, data: { paymentIntentId: created.paymentIntentId, clientSecret: created.clientSecret } });
  }
  const fresh = await db.partyChange.findUnique({ where: { id: change.id } });
  return { clientSecret: fresh.clientSecret, publishableKey: getPublicPaymentProviderConfig(prov.code)?.publishableKey || null, expiresAt: fresh.expiresAt };
}
async function expireChange(tx, change, actorId, reason = "Payment not completed in time") {
  await tx.partyChange.update({ where: { id: change.id }, data: { status: "cancelled" } });
  if (change.holdId) await tx.inventoryHold.updateMany({ where: { id: change.holdId, status: "active" }, data: { status: "released" } });
  await audit(tx, actorId, "party_change.cancelled", "PartyChange", change.id, { status: change.status }, { status: "cancelled" }, reason);
}
async function completePartyChange(_r, args, context) {
  try {
    const db = context.prisma, b0 = await load2(db, args);
    const change = await db.partyChange.findUnique({ where: { id: String(args.changeId || "") } });
    if (!change || change.bookingId !== b0.id) throw new Error("Change not found");
    if (change.status === "applied") return { changeId: change.id, status: "applied", bookingRef: b0.bookingRef };
    if (change.status !== "pending_payment") throw new Error(change.status === "failed" ? "This change could not be made and its payment was refunded" : "This change was cancelled");
    if (!change.paymentIntentId) throw new Error("Payment has not started");
    const prov = await provider2(db);
    const observed = await getPaymentStatus({ provider: prov, paymentId: change.paymentIntentId });
    if (observed.status !== "succeeded") {
      if (change.expiresAt <= /* @__PURE__ */ new Date()) {
        await db.$transaction(async (tx) => {
          await lockTransactionKey(tx, `departure:${b0.departureId}`);
          const c = await tx.partyChange.findUnique({ where: { id: change.id } });
          if (c.status === "pending_payment") await expireChange(tx, c, null);
        }, { timeout: 2e4 });
        try {
          await cancelPayment({ provider: prov, paymentId: change.paymentIntentId, idempotencyKey: `party-change-cancel:${change.id}` });
        } catch {
        }
        throw new Error("The time to pay for this change ran out. Nothing was charged and nothing changed");
      }
      throw new Error("Payment not completed");
    }
    if (observed.amount !== change.collectCents || String(observed.currencyCode).toUpperCase() !== change.currencyCode) throw new Error("Payment amount does not match the change; contact the operator");
    let failed = false;
    await db.$transaction(async (tx) => {
      const b = await bookingFor(tx, b0.id);
      await lockTransactionKey(tx, `departure:${b.departureId}`);
      const c = await tx.partyChange.findUnique({ where: { id: change.id } });
      if (c.status !== "pending_payment" && c.status !== "cancelled") return;
      await tx.payment.upsert({ where: { idempotencyKey: `party-change:${c.id}` }, update: {}, create: { idempotencyKey: `party-change:${c.id}`, amount: c.collectCents, currencyCode: c.currencyCode, status: "succeeded", paymentMethod: "credit_card", paymentProviderId: prov.id, providerPaymentId: c.paymentIntentId, orderId: b.id, processedAt: /* @__PURE__ */ new Date(), isSplitPayment: true, notes: "Party change difference", data: { paymentIntentId: c.paymentIntentId, partyChangeId: c.id } } });
      const P = c.plan;
      const hold = c.holdId ? await tx.inventoryHold.findUnique({ where: { id: c.holdId } }) : null;
      const held = !!hold && hold.status === "active" && hold.expiresAt > /* @__PURE__ */ new Date();
      if (!unchanged(b, P.baseline) || !held && !await roomFor(tx, b, P.addSeats, hold?.id)) {
        failed = true;
        await tx.partyChange.update({ where: { id: c.id }, data: { status: "failed" } });
        if (hold?.status === "active") await tx.inventoryHold.update({ where: { id: hold.id }, data: { status: "released" } });
        await audit(tx, null, "party_change.failed", "PartyChange", c.id, { status: c.status }, { status: "failed" }, "Seats or booking changed before payment completed; payment refunded", args.idempotencyKey || c.id);
        return;
      }
      if (hold) await tx.inventoryHold.update({ where: { id: hold.id }, data: { status: "converted" } });
      await tx.partyChange.update({ where: { id: c.id }, data: { status: "applied" } });
      await applyPlan(tx, b, P, null, "booking.party_changed", `${c.reason}: difference paid by card`, args.idempotencyKey || c.id);
    }, { timeout: 2e4 });
    if (failed) {
      await issueRefund(db, { bookingId: b0.id, amount: change.collectCents, reason: "Party change could not be made after payment", key: `party-change-failed:${change.id}`, actorId: null, tenderOnly: true });
      throw new Error("The seats were taken before your payment went through. Your payment for the change was refunded and your booking is as it was");
    }
    return { changeId: change.id, status: "applied", bookingRef: b0.bookingRef };
  } catch (e) {
    throw userFacingError(e);
  }
}
function staffGuard(b) {
  if (b.status !== "confirmed") throw new Error("Only a confirmed booking can be changed");
  if (b.channelId) throw new Error("Reseller bookings are changed through the reseller");
  if (b.departure.startAt.getTime() <= Date.now()) throw new Error("This departure has started");
}
async function bookingParty(_r, args, context) {
  try {
    await authorize(context, "canManageBookings");
    const db = context.prisma, b = await bookingFor(db, String(args.bookingId || ""));
    let canChange = true, why = "";
    try {
      staffGuard(b);
    } catch (e) {
      canChange = false;
      why = e.message;
    }
    const pending = await db.partyChange.findFirst({ where: { bookingId: b.id, status: "pending_payment", expiresAt: { gt: /* @__PURE__ */ new Date() } }, select: { id: true, collectCents: true } });
    return {
      bookingRef: b.bookingRef,
      canChange: canChange && !pending,
      reason: pending ? "The guest is paying for a change right now" : why,
      currencyCode: b.currencyCode,
      totalCents: b.totalCents,
      participants: b.participants.map((p2) => ({ id: p2.id, fullName: p2.fullName, ticket: p2.ticketTypeSnapshot?.name || "", checkedIn: p2.checkInStatus === "checked_in" })),
      tickets: canChange ? (await ticketOffers(db, b)).map((t) => ({ id: t.id, name: t.name, unitPriceCents: t.unitPriceCents })) : []
    };
  } catch (e) {
    throw userFacingError(e);
  }
}
async function bookingPartyQuote(_r, args, context) {
  try {
    await authorize(context, "canManageBookings");
    const db = context.prisma, b = await bookingFor(db, String(args.bookingId || ""));
    staffGuard(b);
    const P = planChange(await pricing(db, b), b, args.input, false);
    return { ...view3(P, b.currencyCode), roomForAdded: await roomFor(db, b, P.addSeats), needsApproval: P.refundCents > P.refundThresholdCents };
  } catch (e) {
    throw userFacingError(e);
  }
}
async function changeBookingParty(_r, args, context) {
  try {
    const user = await authorize(context, "canManageBookings");
    const i = args.input || {}, reason = String(i.reason || "").trim();
    if (!reason) throw new Error("A reason is required");
    const b0 = await bookingFor(context.prisma, String(i.bookingId || ""));
    const done = await context.prisma.partyChange.findUnique({ where: { requestKey: `changeBookingParty:${args.idempotencyKey}` } });
    if (done && done.bookingId === b0.id) {
      const r = done.refundCents > 0 ? await settleByKey(context.prisma, b0.id, `party-change:${done.id}`, user.id, done.reason) : null;
      return { changeId: done.id, bookingRef: b0.bookingRef, status: done.status, seats: done.plan?.seats, totalCents: done.plan?.totals?.totalCents, collectCents: done.collectCents, refundCents: done.refundCents, currencyCode: done.currencyCode, replay: true, ...r ? { refundStatus: r.status } : {} };
    }
    const pr = await pricing(context.prisma, b0);
    const preview = planChange(pr, b0, i, false);
    let approvalId;
    if (preview.refundCents > 0) {
      await authorize(context, "canIssueRefunds");
      if (preview.refundCents > preview.refundThresholdCents) {
        const match = await context.prisma.managerApproval.findFirst({ where: { actionType: "refund_booking", targetId: b0.id, amount: preview.refundCents, reason, requestedById: user.id, status: "approved", expiresAt: { gt: /* @__PURE__ */ new Date() } }, orderBy: { approvedAt: "desc" }, select: { id: true } });
        approvalId = match?.id;
      }
    }
    const result = await command(context, args.idempotencyKey, "changeBookingParty", { bookingId: b0.id, keep: i.keep, add: i.add, reason }, [`departure:${b0.departureId}`], async (tx) => {
      const b = await bookingFor(tx, b0.id);
      staffGuard(b);
      if (await tx.partyChange.findFirst({ where: { bookingId: b.id, status: "pending_payment", expiresAt: { gt: /* @__PURE__ */ new Date() } } })) throw new Error("The guest is paying for a change right now. Try again in a few minutes");
      const P = planChange(pr, b, i, false);
      if (P.refundCents !== preview.refundCents || P.collectCents !== preview.collectCents) throw new Error("Prices changed while you were editing. Check the new amount and try again");
      if (!await roomFor(tx, b, P.addSeats)) throw new Error("Not enough seats on this departure for the people added");
      const change = await tx.partyChange.create({ data: { bookingId: b.id, source: "staff", status: "applied", plan: P, differenceCents: P.differenceCents, collectCents: P.collectCents, refundCents: P.refundCents, currencyCode: b.currencyCode, reason, requestKey: `changeBookingParty:${args.idempotencyKey}` } });
      if (P.collectCents > 0) await tx.payment.create({ data: { idempotencyKey: `party-change:${change.id}`, amount: P.collectCents, currencyCode: b.currencyCode, status: "succeeded", paymentMethod: "cash", orderId: b.id, processedAt: /* @__PURE__ */ new Date(), processedById: user.id, isSplitPayment: true, notes: "Party change difference, collected by operator", data: { partyChangeId: change.id } } });
      await applyPlan(tx, b, P, user.id, "booking.party_changed", reason, args.idempotencyKey);
      if (P.refundCents > 0) await reserveRefund(tx, { bookingId: b.id, amount: P.refundCents, reason, key: `party-change:${change.id}`, actorId: user.id, approvalId, approvalThresholdCents: P.refundThresholdCents, tenderOnly: true });
      return { changeId: change.id, bookingRef: b.bookingRef, status: "applied", seats: P.seats, totalCents: P.totals.totalCents, collectCents: P.collectCents, refundCents: P.refundCents, currencyCode: b.currencyCode };
    });
    if (result.refundCents > 0) {
      const r = await settleByKey(context.prisma, b0.id, `party-change:${result.changeId}`, user.id, reason);
      return { ...result, refundStatus: r?.status || "succeeded" };
    }
    return result;
  } catch (e) {
    const err = userFacingError(e);
    if (/approval is required|approval request not found/i.test(err?.message || "")) throw userFacingError(new Error("The refund for this change is over the approval threshold. Request approval for this exact amount and reason first"));
    throw err;
  }
}

// features/keystone/mutations/tour-manifest.ts
var LIVE5 = ["confirmed", "checked_in", "completed", "no_show", "partially_refunded"];
async function departuresInRange(_r, args, context) {
  const user = await authorize(context, "canCheckIn");
  const scope = await scopedDepartureFilter(context.prisma, user);
  const from = new Date(args.from), to = new Date(args.to);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from || to.getTime() - from.getTime() > 31 * 864e5) throw new Error("Choose a range of at most 31 days");
  const rows = await context.prisma.departure.findMany({
    where: { startAt: { gte: from, lt: to }, ...scope || {} },
    orderBy: { startAt: "asc" },
    take: 300,
    include: { tour: { select: { id: true, name: true, guideRatio: true, minParticipants: true, requiresWaiverId: true } }, assignedGuides: { include: { guide: { select: { id: true, name: true } } } }, resourceAssignments: { include: { resource: { select: { name: true } } } } }
  });
  const out = [];
  for (const d of rows) {
    const [booked, held, gaps] = await Promise.all([
      context.prisma.booking.aggregate({ where: { departureId: d.id, status: { in: LIVE5 } }, _sum: { seats: true }, _count: true }),
      context.prisma.inventoryHold.aggregate({ where: { departureId: d.id, status: "active", expiresAt: { gt: /* @__PURE__ */ new Date() } }, _sum: { quantity: true } }),
      context.prisma.participant.count({ where: { waiverStatus: "required", booking: { departureId: d.id, status: { in: LIVE5 } } } })
    ]);
    const seats = booked._sum.seats || 0;
    const accepted = d.assignedGuides.filter((a) => ["accepted", "worked"].includes(a.status));
    out.push({
      id: d.id,
      startAt: d.startAt,
      endAt: d.endAt,
      status: d.status,
      capacity: d.capacity,
      tourId: d.tour.id,
      tourName: d.tour.name,
      minParticipants: d.tour.minParticipants,
      booked: seats,
      held: held._sum.quantity || 0,
      bookings: booked._count,
      waiverGaps: gaps,
      guidesNeeded: Math.ceil(seats / d.tour.guideRatio),
      guidesAssigned: accepted.length,
      staffed: accepted.length >= Math.ceil(seats / d.tour.guideRatio),
      guides: d.assignedGuides.map((a) => ({ id: a.id, name: a.guide?.name, role: a.role, status: a.status })),
      resources: d.resourceAssignments.map((r) => `${r.resource?.name} x${r.quantity}`)
    });
  }
  return out;
}
async function departureManifest(_r, args, context) {
  const user = await authorize(context, "canCheckIn");
  const canMedical = !!user.role?.canReadMedicalNotes;
  await assertDepartureAccess(context.prisma, user, String(args.departureId || ""));
  const d = await context.prisma.departure.findUnique({ where: { id: args.departureId }, include: { tour: { include: { meetingPoint: true } } } });
  if (!d) throw new Error("Departure not found");
  const bookings = await context.prisma.booking.findMany({ where: { departureId: d.id, status: { in: LIVE5 } }, orderBy: { bookingRef: "asc" }, include: { participants: true } });
  if (canMedical && bookings.some((b) => b.participants.some((p2) => p2.medicalNotes))) {
    await context.prisma.$transaction((tx) => audit(tx, user.id, "medical_notes.read", "Departure", d.id, null, null, "Manifest viewed"));
  }
  return {
    departure: { id: d.id, startAt: d.startAt, endAt: d.endAt, status: d.status, tourName: d.tour.name, meetingPoint: d.tour.meetingPoint?.name || null },
    bookings: bookings.map((b) => ({
      id: b.id,
      bookingRef: b.bookingRef,
      status: b.status,
      leadName: b.guestName,
      leadPhone: b.guestPhone,
      pickupLocation: b.pickupLocation,
      specialRequests: b.specialRequests,
      participants: b.participants.map((p2) => ({ id: p2.id, fullName: p2.fullName, age: p2.age, dietary: p2.dietary, medicalFlag: !!p2.medicalNotes, medicalNotes: canMedical ? p2.medicalNotes : null, waiverStatus: p2.waiverStatus, checkInStatus: p2.checkInStatus }))
    }))
  };
}

// features/keystone/mutations/updateActiveUser.ts
async function updateActiveUser(_root, { data }, context) {
  if (!isSignedIn({ session: context.session })) throw new Error("Not authenticated");
  const allowed = /* @__PURE__ */ new Set(["name", "onboardingStatus"]);
  if (Object.keys(data || {}).some((key) => !allowed.has(key))) throw new Error("Unsupported profile field");
  if (data.onboardingStatus && !["not_started", "in_progress", "completed", "dismissed"].includes(data.onboardingStatus)) throw new Error("Invalid onboarding status");
  return context.db.User.updateOne({ where: { id: context.session.itemId }, data });
}

// features/keystone/mutations/tour-settlement.ts
function validatePayout(payout) {
  if (!payout.assignments.length || payout.assignments.some((a) => a.status !== "worked" || a.guideId !== payout.guideId || a.currencyCode !== payout.currencyCode)) throw new Error("Payout requires worked assignments for the same guide and currency");
  const total = payout.assignments.reduce((n, a) => n + a.payCents, 0);
  if (!Number.isSafeInteger(total) || total < 0 || total !== payout.totalCents) throw new Error("Payout total does not match assignments");
}
function settlementTransition(kind, current, next, reference) {
  const first = kind === "payout" ? "draft" : "open", second = kind === "payout" ? "approved" : "invoiced";
  if (!(current === first && next === second || current === second && next === "paid")) throw new Error("Invalid settlement transition");
  if (next === "paid" && (!reference?.trim() || reference.trim().length > 200)) throw new Error("Payment receipt/reference required (maximum 200 characters)");
}
async function transitionGuidePayout(_r, args, context) {
  await authorize(context, "canManageGuides");
  await authorize(context, "canManagePayments");
  const i = args.input;
  return command(context, args.idempotencyKey, "transitionGuidePayout", i, [`payout:${i.id}`], async (tx) => {
    const payout = await tx.guidePayout.findUnique({ where: { id: i.id }, include: { assignments: true } });
    if (!payout) throw new Error("Payout not found");
    settlementTransition("payout", payout.status, i.status, i.reference);
    validatePayout(payout);
    const result = await tx.guidePayout.updateMany({ where: { id: payout.id, status: payout.status }, data: { status: i.status, ...i.status === "paid" ? { paidAt: /* @__PURE__ */ new Date(), reference: i.reference.trim() } : {} } });
    if (result.count !== 1) throw new Error("Payout changed concurrently");
    await audit(tx, context.session.itemId, "guide.payout_" + i.status, "GuidePayout", payout.id, { status: payout.status }, { status: i.status, totalCents: payout.totalCents, currencyCode: payout.currencyCode, reference: i.reference?.trim() || "" }, i.reference?.trim() || "", args.idempotencyKey);
    return { id: payout.id, status: i.status };
  });
}
async function transitionChannelStatement(_r, args, context) {
  await authorize(context, "canManageChannels");
  await authorize(context, "canManagePayments");
  const i = args.input;
  const row = await context.prisma.channelStatement.findUnique({ where: { id: i.id }, select: { channelId: true } });
  if (!row) throw new Error("Statement not found");
  return command(context, args.idempotencyKey, "transitionChannelStatement", i, [`channel:${row.channelId}`], async (tx) => {
    const linked = await tx.booking.findMany({ where: { statementId: i.id }, select: { departureId: true } });
    for (const id of [...new Set(linked.map((b) => b.departureId))].sort()) await lockTransactionKey(tx, `departure:${id}`);
    const statement = await tx.channelStatement.findUnique({ where: { id: i.id }, include: { bookings: true } });
    if (!statement) throw new Error("Statement not found");
    settlementTransition("statement", statement.status, i.status, i.reference);
    const gross = statement.bookings.reduce((n, b) => n + b.totalCents - b.refundedCents, 0);
    if (!statement.bookings.length || gross !== statement.grossCents) throw new Error("Statement has no bookings or changed refunds; reconcile before settlement");
    const result = await tx.channelStatement.updateMany({ where: { id: statement.id, status: statement.status }, data: { status: i.status } });
    if (result.count !== 1) throw new Error("Statement changed concurrently");
    await audit(tx, context.session.itemId, "channel.statement_" + i.status, "ChannelStatement", statement.id, { status: statement.status }, { status: i.status, netDueCents: statement.netDueCents, currencyCode: statement.currencyCode, reference: i.reference?.trim() || "", recordedAt: (/* @__PURE__ */ new Date()).toISOString() }, i.reference?.trim() || "", args.idempotencyKey);
    return { id: statement.id, status: i.status };
  });
}

// features/keystone/lib/tour-pricing-rules.ts
var MAX_OVERRIDE_CENTS = 1e8;
var DAY3 = /^\d{4}-\d{2}-\d{2}$/;
var plusDay2 = (d, n) => new Date((/* @__PURE__ */ new Date(`${d}T12:00:00Z`)).getTime() + n * 864e5).toISOString().slice(0, 10);
function checkRule(i, timeZone) {
  const name3 = String(i.name || "").trim();
  if (!name3 || name3.length > 80) throw new Error("Give the rule a name of 80 characters or fewer");
  const hasAdjust = i.adjustBps !== null && i.adjustBps !== void 0, hasOverride = i.overridePriceCents !== null && i.overridePriceCents !== void 0;
  if (hasAdjust === hasOverride) throw new Error("Set either a percentage change or a fixed price, not both and not neither");
  if (hasAdjust && (!Number.isInteger(i.adjustBps) || i.adjustBps < -9e3 || i.adjustBps > 1e5)) throw new Error("The percentage change must be between -90% and +1000%");
  if (hasOverride && (!Number.isSafeInteger(i.overridePriceCents) || i.overridePriceCents < 0 || i.overridePriceCents > MAX_OVERRIDE_CENTS)) throw new Error("The fixed price must be a whole number of cents from 0 to 1,000,000.00");
  for (const d of [i.from, i.to]) if (d && !DAY3.test(d)) throw new Error("Dates must be YYYY-MM-DD");
  if (i.from && i.to && i.to < i.from) throw new Error("The end date is before the start date");
  const days = i.weekdays?.length ? [...new Set(i.weekdays)].sort((a, b) => a - b) : null;
  if (days && days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error("Weekdays must be Sunday (0) to Saturday (6)");
  if (days && days.length === 7) return { name: name3, weekdays: null, ...window(i, timeZone), adjustBps: hasAdjust ? i.adjustBps : null, overridePriceCents: hasOverride ? i.overridePriceCents : null };
  return { name: name3, weekdays: days, ...window(i, timeZone), adjustBps: hasAdjust ? i.adjustBps : null, overridePriceCents: hasOverride ? i.overridePriceCents : null };
}
function window(i, tz) {
  return {
    validFrom: i.from ? zonedStart(i.from, "00:00", tz) : null,
    validTo: i.to ? new Date(zonedStart(plusDay2(i.to, 1), "00:00", tz).getTime() - 1e3) : null
  };
}
var dayOf = (d, tz) => d ? new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(d)) : null;

// features/keystone/mutations/tour-pricing-rules.ts
var shape = (r, tz) => ({
  id: r.id,
  name: r.name,
  tourId: r.tourId,
  ticketTypeId: r.ticketTypeId || null,
  from: dayOf(r.validFrom, tz),
  to: dayOf(r.validTo, tz),
  weekdays: Array.isArray(r.weekdays) ? r.weekdays : [],
  adjustBps: r.adjustBps ?? null,
  overridePriceCents: r.overridePriceCents ?? null,
  currencyCode: r.currencyCode
});
async function pricingRuleBoard(_r, _args, context) {
  await authorize(context, "canManageTours");
  try {
    const db = context.prisma;
    const [tours, rules2] = await Promise.all([
      db.tour.findMany({ where: { status: { not: "archived" } }, orderBy: { name: "asc" }, take: 200, select: { id: true, name: true, timezone: true, ticketTypes: { where: { active: true }, orderBy: { priceCents: "desc" }, select: { id: true, name: true, priceCents: true, currencyCode: true } } } }),
      db.pricingRule.findMany({ orderBy: [{ createdAt: "desc" }], take: 1e3 })
    ]);
    const zone2 = new Map(tours.map((t) => [t.id, t.timezone || "America/New_York"]));
    return { tours, rules: rules2.filter((r) => r.tourId).map((r) => shape(r, zone2.get(r.tourId) || "America/New_York")) };
  } catch (e) {
    throw userFacingError(e);
  }
}
async function savePricingRule(_r, args, context) {
  const actor = await authorize(context, "canManageTours");
  const i = args.input;
  if (!i?.tourId) throw new Error("Choose a tour");
  return command(context, args.idempotencyKey, "savePricingRule", i, [`pricingrules:${i.tourId}`], async (tx) => {
    const tour = await tx.tour.findUnique({ where: { id: i.tourId }, select: { id: true, timezone: true } });
    if (!tour) throw new Error("Tour not found");
    const tz = tour.timezone || "America/New_York";
    const checked = checkRule(i, tz);
    let ticket = null;
    if (i.ticketTypeId) {
      ticket = await tx.ticketType.findFirst({ where: { id: i.ticketTypeId, tourId: tour.id } });
      if (!ticket) throw new Error("That ticket type is not on this tour");
    }
    const currencyCode = ticket?.currencyCode || (await tx.ticketType.findFirst({ where: { tourId: tour.id }, select: { currencyCode: true } }))?.currencyCode || "USD";
    const data = { name: checked.name, validFrom: checked.validFrom, validTo: checked.validTo, weekdays: checked.weekdays ?? void 0, adjustBps: checked.adjustBps, overridePriceCents: checked.overridePriceCents, currencyCode };
    if (i.id) {
      const before = await tx.pricingRule.findUnique({ where: { id: i.id } });
      if (!before || before.tourId !== tour.id) throw new Error("Pricing rule not found");
      const row2 = await tx.pricingRule.update({ where: { id: i.id }, data: { ...data, weekdays: checked.weekdays ?? [], ticketType: ticket ? { connect: { id: ticket.id } } : { disconnect: true } } });
      await audit(tx, actor.id, "pricing_rule.updated", "PricingRule", row2.id, shape(before, tz), shape(row2, tz));
      return { id: row2.id };
    }
    const row = await tx.pricingRule.create({ data: { ...data, weekdays: checked.weekdays ?? [], tour: { connect: { id: tour.id } }, ...ticket ? { ticketType: { connect: { id: ticket.id } } } : {} } });
    await audit(tx, actor.id, "pricing_rule.created", "PricingRule", row.id, null, shape(row, tz));
    return { id: row.id };
  });
}
async function removePricingRule(_r, args, context) {
  const actor = await authorize(context, "canManageTours");
  const i = args.input;
  const found = await context.prisma.pricingRule.findUnique({ where: { id: i?.id }, select: { tourId: true } });
  if (!found) throw new Error("Pricing rule not found");
  return command(context, args.idempotencyKey, "removePricingRule", i, [`pricingrules:${found.tourId}`], async (tx) => {
    const before = await tx.pricingRule.findUnique({ where: { id: i.id }, include: { tour: { select: { timezone: true } } } });
    if (!before) throw new Error("Pricing rule not found");
    await tx.pricingRule.delete({ where: { id: i.id } });
    await audit(tx, actor.id, "pricing_rule.removed", "PricingRule", i.id, shape(before, before.tour?.timezone || "America/New_York"), null);
    return { id: i.id, removed: true };
  });
}

// features/keystone/mutations/index.ts
var graphql2 = String.raw;
function extendGraphqlSchema(baseSchema) {
  return (0, import_schema.mergeSchemas)({
    schemas: [baseSchema],
    typeDefs: graphql2`
      scalar JSON
      input UserUpdateProfileInput { onboardingStatus: String, name: String }
      input TourTicketChoice { id: ID!, qty: Int! }
      input DepartureHoldInput { departureId: ID!, tickets: [TourTicketChoice!]!, addOns: [TourTicketChoice!], promoCode: String, token: String! }
      input BookingParticipantInput { ticketTypeId: ID!, fullName: String!, age: Int, email: String, dietary: String, medicalNotes: String }
      input BookingLeadInput { name: String!, email: String!, phone: String, specialRequests: String, pickupLocation: String }
      input StartBookingCheckoutInput { holdId: ID!, token: String!, lead: BookingLeadInput!, participants: [BookingParticipantInput!]!, giftCardCode: String }
      input IssueGiftCardInput { amountCents: Int!, fundedBy: String!, recipientName: String, recipientEmail: String, expiresAt: String, note: String }
      input VoidGiftCardInput { id: ID!, reason: String! }
      input CompleteBookingCheckoutInput { bookingRef: String!, token: String! }
      input ChannelBookingInput { departureId: ID!, source: String!, channelId: ID, paymentMethod: String, tickets: [TourTicketChoice!]!, addOns: [TourTicketChoice!], promoCode: String, lead: BookingLeadInput!, participants: [BookingParticipantInput!]! }
      input SignWaiverInput { token: String!, signerName: String!, isGuardian: Boolean, minorName: String }
      input RefundBookingInput { bookingId: ID!, amountCents: Int!, reason: String!, approvalId: ID, cancelBooking: Boolean }
      input SalesReportInput { from: String!, to: String!, basis: String }
      input CaptureWaiverInput { participantId: ID!, signerName: String!, isGuardian: Boolean }
      input WeatherCancelInput { departureId: ID!, reason: String! }
      input WeatherRebookInput { bookingId: ID!, departureId: ID! }
      input CancelDepartureInput { departureId: ID!, reason: String!, offerCredit: Boolean }
      input RebookInput { token: String!, departureId: ID! }
      input GenerateDeparturesInput { tourId: ID, days: Int }
      input AssignGuideInput { departureId: ID!, guideId: ID!, role: String }
      input RespondAssignmentInput { assignmentId: ID!, status: String! }
      input AssignResourceInput { departureId: ID!, resourceId: ID!, quantity: Int! }
      input UnassignResourceInput { departureId: ID! }
      input ResizeDepartureInput { departureId: ID!, capacity: Int! }
      input ParticipantActionInput { participantId: ID! }
      input OfflineTapInput { key: String!, kind: String!, participantId: ID, bookingId: ID, recordedAt: String! }
      input SyncOfflineCheckInsInput { departureId: ID!, events: [OfflineTapInput!]! }
      input BookingActionInput { bookingId: ID! }
      input ResetGuestLinkInput { bookingId: ID!, reason: String }
      input WaitlistJoinInput { departureId: ID!, tickets: [TourTicketChoice!]!, lead: BookingLeadInput!, note: String }
      input WaitlistWithdrawInput { entryId: ID!, reason: String! }
      input WaitlistBookInput { entryId: ID!, participants: [String!]! }
      input PartyAddInput { ticketTypeId: ID!, fullName: String!, age: Int }
      input PartyChangeInput { keep: [ID!]!, add: [PartyAddInput!] }
      input StaffPartyChangeInput { bookingId: ID!, keep: [ID!]!, add: [PartyAddInput!], reason: String! }
      input MoveBookingInput { bookingId: ID!, departureId: ID!, reason: String! }
      input CloseDepartureInput { departureId: ID! }
      input ChannelStatementInput { channelId: ID!, from: String!, to: String! }
      input SettlementTransitionInput { id: ID!, status: String!, reference: String }
      input PricingRuleInput { id: ID, tourId: ID!, ticketTypeId: ID, name: String!, from: String, to: String, weekdays: [Int!], adjustBps: Int, overridePriceCents: Int }
      input PricingRuleRemoveInput { id: ID! }
      type Query {
        redirectToInit: Boolean
        tourTotal: Int
        operatorName: String
        checkoutHold(holdId: ID!, token: String!): JSON
        bookingRefExists(bookingRef: String!): Boolean
        waiverForToken(token: String!): JSON
        departuresInRange(from: String!, to: String!): JSON
        departureManifest(departureId: ID!): JSON
        toursOnSale: JSON
        tourAvailability(tourId: ID!, from: String!, to: String!): JSON
        lookupBooking(bookingRef: String!, email: String!): JSON
        manageBooking(bookingRef: String!, token: String!): JSON
        bookingMoveOptions(bookingId: ID!): JSON
        operatorBookingByKey(idempotencyKey: String!): JSON
        weatherCancellations: JSON
        participantWaiver(participantId: ID!): JSON
        myDepartures(days: Int): JSON
        pickupSheet(departureId: ID!): JSON
        dayPickupSheet(day: String!): JSON
        salesReport(from: String!, to: String!, basis: String): JSON
        waitlistStatus(entryId: ID!, token: String!): JSON
        waitlistBoard(status: String): JSON
        giftCardBoard(search: String): JSON
        giftCardBalance(code: String!): JSON
        partyChangeQuote(bookingRef: String!, token: String!, input: PartyChangeInput!): JSON
        bookingParty(bookingId: ID!): JSON
        bookingPartyQuote(bookingId: ID!, input: PartyChangeInput!): JSON
        guestNotifications(status: String, departureId: ID, from: String, to: String, take: Int): JSON
        pricingRuleBoard: JSON
      }
      type Mutation {
        createDepartureHold(input: DepartureHoldInput!, idempotencyKey: String!): JSON
        startBookingCheckout(input: StartBookingCheckoutInput!, idempotencyKey: String!): JSON
        completeBookingCheckout(input: CompleteBookingCheckoutInput!, idempotencyKey: String!): JSON
        cancelMyBooking(bookingRef: String!, email: String!, idempotencyKey: String!): JSON
        cancelManagedBooking(bookingRef: String!, token: String!, idempotencyKey: String!): JSON
        rescheduleManagedBooking(bookingRef: String!, token: String!, departureId: ID!, idempotencyKey: String!): JSON
        signWaiver(input: SignWaiverInput!, idempotencyKey: String!): JSON
        rebookWithCredit(input: RebookInput!, idempotencyKey: String!): JSON
        generateDepartures(input: GenerateDeparturesInput, idempotencyKey: String!): JSON
        assignGuide(input: AssignGuideInput!, idempotencyKey: String!): JSON
        respondToAssignment(input: RespondAssignmentInput!, idempotencyKey: String!): JSON
        assignResource(input: AssignResourceInput!, idempotencyKey: String!): JSON
        unassignResource(input: UnassignResourceInput!, idempotencyKey: String!): JSON
        resizeDeparture(input: ResizeDepartureInput!, idempotencyKey: String!): JSON
        checkInParticipant(input: ParticipantActionInput!, idempotencyKey: String!): JSON
        syncOfflineCheckIns(input: SyncOfflineCheckInsInput!, idempotencyKey: String!): JSON
        markNoShow(input: BookingActionInput!, idempotencyKey: String!): JSON
        undoNoShow(input: BookingActionInput!, idempotencyKey: String!): JSON
        resetGuestLink(input: ResetGuestLinkInput!, idempotencyKey: String!): JSON
        joinWaitlist(input: WaitlistJoinInput!, idempotencyKey: String!): JSON
        issueGiftCard(input: IssueGiftCardInput!, idempotencyKey: String!): JSON
        voidGiftCard(input: VoidGiftCardInput!, idempotencyKey: String!): JSON
        revealGiftCardCode(id: ID!): JSON
        addToWaitlist(input: WaitlistJoinInput!, idempotencyKey: String!): JSON
        claimWaitlistOffer(entryId: ID!, token: String!, cartToken: String!): JSON
        leaveWaitlist(entryId: ID!, token: String!, idempotencyKey: String!): JSON
        withdrawWaitlistEntry(input: WaitlistWithdrawInput!, idempotencyKey: String!): JSON
        bookWaitlistOffer(input: WaitlistBookInput!, idempotencyKey: String!): JSON
        changeParty(bookingRef: String!, token: String!, input: PartyChangeInput!, idempotencyKey: String!): JSON
        completePartyChange(bookingRef: String!, token: String!, changeId: ID!, idempotencyKey: String): JSON
        changeBookingParty(input: StaffPartyChangeInput!, idempotencyKey: String!): JSON
        moveBooking(input: MoveBookingInput!, idempotencyKey: String!): JSON
        cancelDeparture(input: CancelDepartureInput!, idempotencyKey: String!): JSON
        exportSalesCsv(input: SalesReportInput!): JSON
        captureWaiverOnSite(input: CaptureWaiverInput!, idempotencyKey: String!): JSON
        weatherCancelDeparture(input: WeatherCancelInput!, idempotencyKey: String!): JSON
        rebookWeatherBooking(input: WeatherRebookInput!, idempotencyKey: String!): JSON
        closeDeparture(input: CloseDepartureInput!, idempotencyKey: String!): JSON
        createChannelBooking(input: ChannelBookingInput!, idempotencyKey: String!): JSON
        refundBooking(input: RefundBookingInput!, idempotencyKey: String!): JSON
        requestRefundApproval(bookingId: ID!, reason: String!, amount: Int!): JSON
        approveRefund(approvalId: ID!): JSON
        generateChannelStatement(input: ChannelStatementInput!, idempotencyKey: String!): JSON
        transitionGuidePayout(input: SettlementTransitionInput!, idempotencyKey: String!): JSON
        transitionChannelStatement(input: SettlementTransitionInput!, idempotencyKey: String!): JSON
        savePricingRule(input: PricingRuleInput!, idempotencyKey: String!): JSON
        removePricingRule(input: PricingRuleRemoveInput!, idempotencyKey: String!): JSON
        sweepDepartures(idempotencyKey: String!): JSON
        ensureTourOnboardingRecord(entity: String!, data: JSON!): JSON
        seedTourActivity(template: String!, seed: JSON!): JSON
        updateActiveUser(data: UserUpdateProfileInput!): User
      }
    ` + storeLogoTypeDefs,
    resolvers: {
      Query: { pricingRuleBoard, storeLogo, giftCardBoard, giftCardBalance, partyChangeQuote, bookingParty, bookingPartyQuote, waitlistStatus, waitlistBoard, manageBooking, bookingMoveOptions, myDepartures, pickupSheet, dayPickupSheet, salesReport, operatorBookingByKey, guestNotifications, weatherCancellations, participantWaiver, redirectToInit: redirectToInit_default, departuresInRange, departureManifest, waiverForToken, checkoutHold, bookingRefExists, operatorName: async (_r, _a, c) => (await c.sudo().query.StoreSettings.findMany({ take: 1, query: "name" }))[0]?.name || null, tourTotal: async (_r, _a, c) => c.session?.itemId ? c.sudo().query.Tour.count({}) : 0, toursOnSale, tourAvailability, lookupBooking },
      Mutation: {
        createDepartureHold,
        startBookingCheckout,
        completeBookingCheckout,
        cancelMyBooking,
        cancelManagedBooking,
        rescheduleManagedBooking,
        signWaiver,
        rebookWithCredit,
        generateDepartures,
        assignGuide,
        respondToAssignment,
        assignResource,
        unassignResource,
        resizeDeparture,
        checkInParticipant,
        markNoShow,
        undoNoShow,
        syncOfflineCheckIns,
        resetGuestLink,
        moveBooking,
        transitionGuidePayout,
        transitionChannelStatement,
        savePricingRule,
        removePricingRule,
        changeParty,
        completePartyChange,
        changeBookingParty,
        issueGiftCard,
        voidGiftCard,
        revealGiftCardCode,
        joinWaitlist,
        addToWaitlist,
        claimWaitlistOffer,
        leaveWaitlist,
        withdrawWaitlistEntry,
        bookWaitlistOffer,
        cancelDeparture,
        captureWaiverOnSite,
        exportSalesCsv,
        weatherCancelDeparture,
        rebookWeatherBooking,
        closeDeparture,
        createChannelBooking,
        refundBooking,
        requestRefundApproval,
        approveRefund,
        generateChannelStatement,
        sweepDepartures,
        ensureTourOnboardingRecord,
        seedTourActivity,
        updateActiveUser
      }
    }
  });
}

// features/keystone/lib/mail.ts
var import_nodemailer = require("nodemailer");

// features/keystone/lib/email-layout.ts
var SUPPORT_EMAIL = "hello@tour-guide.openship.org";
var FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
var C = {
  canvas: "#f4f4f5",
  card: "#ffffff",
  text: "#18181b",
  muted: "#52525b",
  subtle: "#71717a",
  line: "#e4e4e7",
  panel: "#fafafa",
  button: "#18181b",
  buttonText: "#ffffff",
  link: "#18181b"
};
var escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function storeNameFromEnv(fallback = "Tour Guide") {
  const match = /^\s*"?([^"<]+?)"?\s*</.exec(process.env.SMTP_FROM || "");
  return match?.[1]?.trim() || fallback;
}
var p = (html, style = "") => `<p class="em-text" style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:24px;color:${C.text};${style}">${html}</p>`;
var emailParagraph = p;
var emailMuted = (html) => `<p class="em-muted" style="margin:0 0 16px;font-family:${FONT};font-size:14px;line-height:22px;color:${C.muted};">${html}</p>`;
function emailButton(label, href) {
  return `<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:8px 0 24px;">
<tr><td class="em-btn" align="center" bgcolor="${C.button}" style="border-radius:8px;background:${C.button};">
<a class="em-btn-a" href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:600;line-height:20px;color:${C.buttonText};text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
</td></tr></table>`;
}
function emailLayout(input) {
  const store = escapeHtml(input.storeName || storeNameFromEnv());
  const support = escapeHtml(input.supportEmail || SUPPORT_EMAIL);
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(input.title)}</title>
<style>
:root { color-scheme: light dark; supported-color-schemes: light dark; }
body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
a { color:${C.link}; }
@media (max-width: 620px) { .em-pad { padding-left:20px !important; padding-right:20px !important; } }
@media (prefers-color-scheme: dark) {
  .em-canvas { background:#09090b !important; }
  .em-card { background:#18181b !important; border-color:#27272a !important; }
  .em-text { color:#fafafa !important; }
  .em-muted { color:#a1a1aa !important; }
  .em-line { border-color:#3f3f46 !important; }
  .em-panel { background:#27272a !important; border-color:#3f3f46 !important; color:#fafafa !important; }
  .em-btn { background:#fafafa !important; }
  .em-btn-a { color:#18181b !important; }
  .em-link { color:#fafafa !important; }
}
[data-ogsc] .em-text { color:#fafafa !important; }
[data-ogsc] .em-muted { color:#a1a1aa !important; }
[data-ogsb] .em-canvas { background:#09090b !important; }
[data-ogsb] .em-card { background:#18181b !important; }
</style>
</head>
<body class="em-canvas" style="margin:0;padding:0;background:${C.canvas};">
${input.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(input.preheader)}</div>` : ""}
<table role="presentation" class="em-canvas" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="${C.canvas}" style="background:${C.canvas};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:600px;">
<tr><td class="em-pad" style="padding:8px 32px 20px;font-family:${FONT};font-size:18px;line-height:24px;font-weight:700;letter-spacing:-0.01em;"><span class="em-text" style="color:${C.text};">${store}</span></td></tr>
<tr><td class="em-card" bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.line};border-radius:12px;">
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
<tr><td class="em-pad" style="padding:32px 32px 16px;">
<h1 class="em-text" style="margin:0 0 16px;font-family:${FONT};font-size:24px;line-height:32px;font-weight:700;letter-spacing:-0.02em;color:${C.text};">${escapeHtml(input.title)}</h1>
${input.body}
</td></tr>
</table>
</td></tr>
<tr><td class="em-pad" style="padding:20px 32px 8px;font-family:${FONT};font-size:13px;line-height:20px;color:${C.subtle};">
<span class="em-muted" style="color:${C.subtle};">${input.footerNote ? `${input.footerNote}<br>` : ""}Questions? Email <a class="em-link" href="mailto:${support}" style="color:${C.muted};text-decoration:underline;">${support}</a>.<br>${store}</span>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// features/keystone/lib/mail.ts
function getBaseUrlForEmails() {
  if (process.env.SMTP_STORE_LINK) {
    return process.env.SMTP_STORE_LINK;
  }
  console.warn("SMTP_STORE_LINK not set. Please add SMTP_STORE_LINK to your environment variables for email links to work properly.");
  return "";
}
var transport = (0, import_nodemailer.createTransport)({
  // @ts-ignore
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});
function passwordResetEmail({ url }) {
  return emailLayout({
    preheader: "Use this link to choose a new password.",
    title: "Reset your password",
    body: `${emailParagraph("We received a request to reset the password for your account. Use the button below to choose a new one.")}
${emailButton("Reset password", url)}
${emailMuted("If you did not request this, you can safely ignore this email. Your password will not change.")}`
  });
}
async function sendPasswordResetEmail(resetToken, to, baseUrl) {
  const frontendUrl = baseUrl || getBaseUrlForEmails();
  const info = await transport.sendMail({
    to,
    from: process.env.SMTP_FROM,
    subject: "Your password reset token!",
    html: passwordResetEmail({
      url: `${frontendUrl}/dashboard/reset?token=${resetToken}`
    })
  });
  if (process.env.MAIL_USER?.includes("ethereal.email")) {
    console.log(`\u{1F4E7} Message Sent!  Preview it at ${(0, import_nodemailer.getTestMessageUrl)(info)}`);
  }
}

// features/keystone/mcp-oauth/session.ts
async function resolveMcpAccessToken(context, token, listKey = "User") {
  try {
    const sudo = context.sudo();
    const record = await sudo.db.OAuthToken.findOne({ where: { token: digestToken(token) } });
    if (!record || record.tokenType !== "access_token" || record.isRevoked !== "false" || !record.userId || !record.expiresAt || new Date(record.expiresAt).getTime() <= Date.now()) {
      return void 0;
    }
    const app = await sudo.db.OAuthApp.findOne({ where: { clientId: record.clientId } });
    if (!app || app.status !== "active") return void 0;
    const mcp = {
      clientId: record.clientId,
      scopes: storedScopes(record.scopes),
      tokenId: String(record.id)
    };
    return { itemId: String(record.userId), listKey, mcp };
  } catch {
    return void 0;
  }
}
function withMcpBearerSessions(strategy, listKey = "User") {
  return {
    ...strategy,
    async get({ context }) {
      const token = bearerToken(context?.req?.headers?.authorization);
      if (isMcpAccessToken(token)) return resolveMcpAccessToken(context, token, listKey);
      return strategy.get({ context });
    }
  };
}

// features/keystone/database-url.ts
var POOL_SIZES = { web: 15, worker: 5 };
var OVERRIDE_ENV = {
  web: "DATABASE_CONNECTION_LIMIT",
  worker: "DATABASE_CONNECTION_LIMIT_WORKER"
};
function pooledDatabaseUrl(url, role = "web") {
  if (!url || !/^postgres(ql)?:\/\//.test(url)) return url;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.searchParams.has("connection_limit")) return url;
  const override = Number(process.env[OVERRIDE_ENV[role]]);
  parsed.searchParams.set("connection_limit", String(Number.isInteger(override) && override > 0 ? override : POOL_SIZES[role]));
  return parsed.toString();
}

// features/keystone/lib/keystonePrismaErrors.ts
var RAW_METHOD = /^\$(queryRaw|executeRaw|queryRawUnsafe|executeRawUnsafe|queryRawTyped|runCommandRaw)$/;
var clients = /* @__PURE__ */ new WeakMap();
var delegates = /* @__PURE__ */ new WeakMap();
function isKeystonePrismaError(value) {
  return value instanceof Error && value.extensions?.code === "KS_PRISMA_ERROR";
}
function rethrowKeystonePrismaError(value) {
  if (!isKeystonePrismaError(value)) return value;
  const prisma = value.extensions.prisma ?? {};
  throw Object.assign(value, { code: prisma.code, meta: prisma.meta, clientVersion: prisma.clientVersion });
}
function throwing(result) {
  if (!result || typeof result.then !== "function") return rethrowKeystonePrismaError(result);
  const settled = () => result.then(rethrowKeystonePrismaError);
  return new Proxy(result, {
    get(target, key) {
      if (key === "then") return (ok, fail) => settled().then(ok, fail);
      if (key === "catch") return (fail) => settled().catch(fail);
      if (key === "finally") return (done) => settled().finally(done);
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}
function throwingDelegate(delegate) {
  const cached = delegates.get(delegate);
  if (cached) return cached;
  const wrapped = new Proxy(delegate, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? (...args) => throwing(value.apply(target, args)) : value;
    }
  });
  delegates.set(delegate, wrapped);
  return wrapped;
}
function throwKeystonePrismaErrors(client) {
  const cached = clients.get(client);
  if (cached) return cached;
  const wrapped = new Proxy(client, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (key === "$transaction" && typeof value === "function") {
        return (work, ...options2) => {
          if (typeof work === "function") return value.call(target, (tx) => work(throwKeystonePrismaErrors(tx)), ...options2);
          return Promise.resolve(value.call(target, work, ...options2)).then((results) => Array.isArray(results) ? results.map(rethrowKeystonePrismaError) : results);
        };
      }
      if (key === "$extends" && typeof value === "function") return (...args) => throwKeystonePrismaErrors(value.apply(target, args));
      if (typeof key === "string" && RAW_METHOD.test(key) && typeof value === "function") return (...args) => throwing(value.apply(target, args));
      if (typeof value === "function") return value.bind(target);
      if (typeof key === "string" && !key.startsWith("$") && value && typeof value === "object" && typeof value.findFirst === "function") return throwingDelegate(value);
      return value;
    }
  });
  clients.set(client, wrapped);
  return wrapped;
}

// features/keystone/index.ts
var databaseURL = process.env.DATABASE_URL || "file:./keystone.db";
var sessionConfig = {
  maxAge: 60 * 60 * 24 * 360,
  // How long they stay signed in?
  secret: process.env.SESSION_SECRET || "this secret should only be used in testing"
};
var {
  S3_BUCKET_NAME: bucketName = "keystone-test",
  S3_REGION: region = "ap-southeast-2",
  S3_ACCESS_KEY_ID: accessKeyId = "keystone",
  S3_SECRET_ACCESS_KEY: secretAccessKey = "keystone",
  S3_ENDPOINT: endpoint = "https://sfo3.digitaloceanspaces.com"
} = process.env;
var { withAuth } = (0, import_auth.createAuth)({
  listKey: "User",
  identityField: "email",
  secretField: "password",
  initFirstItem: {
    fields: ["name", "email", "password"],
    itemData: {
      role: {
        create: {
          name: "Admin",
          ...Object.fromEntries(permissionNames.map((key) => [key, true]))
        }
      }
    }
  },
  passwordResetLink: {
    async sendToken(args) {
      await sendPasswordResetEmail(args.token, args.identity);
    }
  },
  sessionData: `
    name
    email
    role {
      id
      name
      ${permissionNames.join("\n")}
    }
  `
});
var keystone_default = withAuth(
  (0, import_core18.config)({
    db: {
      provider: "postgresql",
      url: pooledDatabaseUrl(databaseURL),
      // Keystone returns failed queries as values; this makes them throw so transactions roll back.
      extendPrismaClient: throwKeystonePrismaErrors,
      shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL
    },
    lists: models,
    storage: {
      my_images: {
        kind: "s3",
        type: "image",
        bucketName,
        region,
        accessKeyId,
        secretAccessKey,
        endpoint,
        signed: { expiry: 5e3 },
        forcePathStyle: true
      }
    },
    ui: {
      isAccessAllowed: ({ session }) => session?.data.role?.canAccessDashboard ?? false
    },
    // MCP OAuth bearer tokens resolve to the approving user; everything else is unchanged.
    session: withMcpBearerSessions((0, import_session.statelessSessions)(sessionConfig)),
    graphql: {
      extendGraphqlSchema
    }
  })
);

// keystone.ts
var keystone_default2 = keystone_default;
//# sourceMappingURL=config.js.map
