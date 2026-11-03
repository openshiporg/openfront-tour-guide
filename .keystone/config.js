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
      automatic_payment_methods: { enabled: true },
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
  canReadPeople: ({ session }) => !session ? false : session.data.role?.canSeeOtherPeople ? true : { id: { equals: session.itemId } },
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
  creditUsedAt: (0, import_fields11.timestamp)()
}, true);
var BookingLine = domainList("canManageBookings", { booking: rel("Booking.lines"), name: (0, import_fields11.text)({ validation: { isRequired: true } }), unitPriceCents: money(), qty: (0, import_fields11.integer)({ validation: { min: 1, isRequired: true } }), seatsUsed: (0, import_fields11.integer)({ defaultValue: 1, validation: { min: 0 } }), kind: state(["ticket", "addon"]), feeCents: money(), taxCents: money(), totalCents: money(), currencyCode: currency(), catalogId: (0, import_fields11.text)() }, true);

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

// features/keystone/models/operations.ts
var import_fields13 = require("@keystone-6/core/fields");
var Channel = domainList("canManageChannels", { name: name(), commissionBps: (0, import_fields13.integer)({ defaultValue: 0, validation: { min: 0, max: 1e4 } }), paymentModel: state(["channel_collects", "we_collect"]), contact: (0, import_fields13.text)(), active: (0, import_fields13.checkbox)({ defaultValue: true }), allocation: (0, import_fields13.integer)({ defaultValue: 0, validation: { min: 0 } }), bookings: rel("Booking.channel", true), statements: rel("ChannelStatement.channel", true) });
var ChannelStatement = domainList("canManageChannels", { channel: rel("Channel.statements"), periodStart: (0, import_fields13.timestamp)(), periodEnd: (0, import_fields13.timestamp)(), bookings: rel("Booking.statement", true), grossCents: money(), commissionCents: money(), netDueCents: money(), currencyCode: currency(), status: state(["open", "invoiced", "paid"]), statementKey: (0, import_fields13.text)({ isIndexed: "unique" }) }, true);
var OperationalTask = domainList("canManageDepartures", { name: name(), departure: rel("Departure.tasks"), status: state(["open", "resolved"]), taskKey: (0, import_fields13.text)({ isIndexed: "unique" }), notes: (0, import_fields13.text)() }, true);
var NotificationPreference = domainList("canManageBookings", { email: (0, import_fields13.text)({ isIndexed: "unique" }), bookingUpdates: (0, import_fields13.checkbox)({ defaultValue: true }), weatherCancellation: (0, import_fields13.checkbox)({ defaultValue: true }) });
var storeSettings = domainList("canManageOnboarding", { name: name(), timezone: (0, import_fields13.text)({ defaultValue: "America/New_York" }), address: (0, import_fields13.text)(), currencyCode: currency(), refundApprovalThresholdCents: (0, import_fields13.integer)({ defaultValue: 1e4, validation: { min: 0 } }), taxBps: (0, import_fields13.integer)({ defaultValue: 0, validation: { min: 0, max: 1e4 } }), settingsKey: (0, import_fields13.text)({ defaultValue: "operator", isIndexed: "unique" }) });
var StoreSettings = { ...storeSettings, graphql: { plural: "StoreSettingsItems" } };
var AuditEvent = domainList("canReadAudit", { actor: rel("User.auditEvents"), action: (0, import_fields13.text)({ validation: { isRequired: true } }), targetList: (0, import_fields13.text)({ validation: { isRequired: true } }), targetId: (0, import_fields13.text)({ validation: { isRequired: true }, isIndexed: true }), before: (0, import_fields13.json)(), after: (0, import_fields13.json)(), reason: (0, import_fields13.text)(), requestId: (0, import_fields13.text)({ isIndexed: true }) }, true);
var PromoCode = domainList("canManagePromos", {
  code: (0, import_fields13.text)({ isIndexed: "unique", validation: { isRequired: true, match: { regex: /^[A-Z0-9_-]{3,40}$/, explanation: "Uppercase letters, digits, dash or underscore" } } }),
  discountType: state(["percent_bps", "amount_cents", "comp"]),
  value: (0, import_fields13.integer)({ defaultValue: 0, validation: { min: 0 } }),
  maxUses: (0, import_fields13.integer)({ validation: { min: 1 } }),
  usedCount: (0, import_fields13.integer)({ defaultValue: 0, access: { create: () => false, update: () => false } }),
  perOrderLimit: (0, import_fields13.integer)({ validation: { min: 1 } }),
  startsAt: (0, import_fields13.timestamp)(),
  endsAt: (0, import_fields13.timestamp)(),
  status: state(["active", "paused", "expired"]),
  tours: rel("Tour.promoCodes", true),
  redemptions: rel("PromoRedemption.promoCode", true)
});
var PromoRedemption = domainList("canManagePromos", {
  promoCode: rel("PromoCode.redemptions"),
  booking: rel("Booking.promoRedemptions"),
  holdId: (0, import_fields13.text)({ isIndexed: true }),
  amountCents: money(),
  currencyCode: currency(),
  status: state(["reserved", "committed", "released"])
}, true);

// features/keystone/models/PaymentProvider.ts
var import_core9 = require("@keystone-6/core");
var import_fields14 = require("@keystone-6/core/fields");
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
    name: (0, import_fields14.text)({
      validation: { isRequired: true }
    }),
    code: (0, import_fields14.text)({
      isIndexed: "unique",
      validation: {
        isRequired: true,
        match: {
          regex: /^pp_[a-zA-Z0-9-_]+$/,
          explanation: 'Payment provider code must start with "pp_" followed by alphanumeric characters, hyphens or underscores'
        }
      }
    }),
    isInstalled: (0, import_fields14.checkbox)({
      defaultValue: true
    }),
    credentials: (0, import_fields14.json)({
      access: { read: () => false, create: canConfigureProvider, update: canConfigureProvider },
      defaultValue: {}
    }),
    metadata: (0, import_fields14.json)({
      defaultValue: {}
    }),
    createPaymentFunction: (0, import_fields14.text)({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to create payments"
      }
    }),
    capturePaymentFunction: (0, import_fields14.text)({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to capture payments"
      }
    }),
    refundPaymentFunction: (0, import_fields14.text)({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to refund payments"
      }
    }),
    getPaymentStatusFunction: (0, import_fields14.text)({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to check payment status"
      }
    }),
    generatePaymentLinkFunction: (0, import_fields14.text)({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to generate payment dashboard links"
      }
    }),
    handleWebhookFunction: (0, import_fields14.text)({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to handle provider webhooks"
      }
    }),
    sessions: (0, import_fields14.relationship)({
      ref: "PaymentSession.paymentProvider",
      many: true
    }),
    ...trackingFields
  }
});

// features/keystone/models/PaymentCollection.ts
var import_core10 = require("@keystone-6/core");
var import_fields15 = require("@keystone-6/core/fields");
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
    description: (0, import_fields15.select)({
      type: "enum",
      options: [
        { label: "Default", value: "default" },
        { label: "Refund", value: "refund" }
      ],
      defaultValue: "default"
    }),
    amount: (0, import_fields15.integer)({
      validation: { isRequired: true }
    }),
    authorizedAmount: (0, import_fields15.integer)({
      defaultValue: 0
    }),
    refundedAmount: (0, import_fields15.integer)({
      defaultValue: 0
    }),
    metadata: (0, import_fields15.json)(),
    paymentSessions: (0, import_fields15.relationship)({
      ref: "PaymentSession.paymentCollection",
      many: true
    }),
    payments: (0, import_fields15.relationship)({
      ref: "Payment.paymentCollection",
      many: true
    }),
    booking: (0, import_fields15.relationship)({ ref: "Booking.paymentCollection" }),
    ...trackingFields
  }
});

// features/keystone/models/PaymentSession.ts
var import_core11 = require("@keystone-6/core");
var import_fields16 = require("@keystone-6/core/fields");
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
    isSelected: (0, import_fields16.checkbox)({
      defaultValue: false
    }),
    isInitiated: (0, import_fields16.checkbox)({
      defaultValue: false
    }),
    amount: (0, import_fields16.integer)({
      validation: { isRequired: true }
    }),
    data: (0, import_fields16.json)({
      defaultValue: {}
    }),
    idempotencyKey: (0, import_fields16.text)({
      validation: { isRequired: true },
      isIndexed: "unique"
    }),
    paymentCollection: (0, import_fields16.relationship)({
      ref: "PaymentCollection.paymentSessions"
    }),
    paymentProvider: (0, import_fields16.relationship)({
      ref: "PaymentProvider.sessions",
      many: false
    }),
    paymentAuthorizedAt: (0, import_fields16.timestamp)(),
    ...trackingFields
  }
});

// features/keystone/models/Payment.ts
var import_core12 = require("@keystone-6/core");
var import_fields17 = require("@keystone-6/core/fields");
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
    idempotencyKey: (0, import_fields17.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    reservedAt: (0, import_fields17.timestamp)(),
    refundedAmount: (0, import_fields17.integer)({ defaultValue: 0, validation: { min: 0 } }),
    amount: (0, import_fields17.integer)({
      validation: { isRequired: true },
      ui: {
        description: "Payment amount in cents"
      }
    }),
    data: (0, import_fields17.json)({
      ui: {
        description: "Payment provider data (clientSecret, paymentIntentId, orderId, etc.)"
      }
    }),
    currencyCode: (0, import_fields17.text)({
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
    status: (0, import_fields17.select)({
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
    paymentMethod: (0, import_fields17.select)({
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
    paymentProvider: (0, import_fields17.relationship)({
      ref: "PaymentProvider",
      ui: {
        displayMode: "select",
        description: "Optional provider backing this payment"
      }
    }),
    providerPaymentId: (0, import_fields17.text)({
      ui: {
        description: "Provider payment identifier (Stripe/PayPal/etc.)"
      }
    }),
    // Card details (last 4 digits for reference)
    cardLast4: (0, import_fields17.text)({
      ui: {
        description: "Last 4 digits of card"
      }
    }),
    cardBrand: (0, import_fields17.text)({
      ui: {
        description: "Card brand (visa, mastercard, etc.)"
      }
    }),
    // Tip handling
    tipAmount: (0, import_fields17.integer)({
      defaultValue: 0,
      ui: {
        description: "Tip amount included in payment in cents"
      }
    }),
    // Split payment support
    isSplitPayment: (0, import_fields17.checkbox)({
      defaultValue: false,
      ui: {
        description: "Whether this payment is part of a split bill"
      }
    }),
    splitPaymentIndex: (0, import_fields17.integer)({
      ui: {
        description: "Index of this payment in split (1, 2, 3, etc.)"
      }
    }),
    splitTotal: (0, import_fields17.integer)({
      ui: {
        description: "Total number of split payments for this order"
      }
    }),
    processedAt: (0, import_fields17.timestamp)({
      ui: {
        description: "When payment was successfully processed"
      }
    }),
    // Metadata for errors or additional info
    errorMessage: (0, import_fields17.text)({
      ui: {
        description: "Error message if payment failed"
      }
    }),
    notes: (0, import_fields17.text)({
      ui: {
        displayMode: "textarea",
        description: "Internal notes about this payment"
      }
    }),
    // Relationships
    order: (0, import_fields17.relationship)({
      ref: "Booking.payments",
      ui: {
        displayMode: "select"
      }
    }),
    paymentCollection: (0, import_fields17.relationship)({
      ref: "PaymentCollection.payments",
      ui: {
        displayMode: "select",
        description: "Payment collection this payment belongs to"
      }
    }),
    processedBy: (0, import_fields17.relationship)({
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
var import_fields18 = require("@keystone-6/core/fields");
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
    idempotencyKey: (0, import_fields18.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    amount: (0, import_fields18.integer)({ validation: { isRequired: true, min: 1 } }),
    currencyCode: (0, import_fields18.text)({ validation: { isRequired: true } }),
    status: (0, import_fields18.select)({
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
    reason: (0, import_fields18.text)({ validation: { isRequired: true }, ui: { displayMode: "textarea" } }),
    providerRefundId: (0, import_fields18.text)(),
    providerData: (0, import_fields18.json)(),
    processedAt: (0, import_fields18.timestamp)(),
    payment: (0, import_fields18.relationship)({ ref: "Payment" }),
    order: (0, import_fields18.relationship)({ ref: "Booking.refunds" }),
    requestedBy: (0, import_fields18.relationship)({ ref: "User" }),
    approvedBy: (0, import_fields18.relationship)({ ref: "User" }),
    ...trackingFields
  }
});

// features/keystone/models/PaymentWebhookEvent.ts
var import_core14 = require("@keystone-6/core");
var import_fields19 = require("@keystone-6/core/fields");
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
    eventKey: (0, import_fields19.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    providerCode: (0, import_fields19.text)({ validation: { isRequired: true }, isIndexed: true }),
    providerEventId: (0, import_fields19.text)({ isIndexed: true }),
    eventType: (0, import_fields19.text)({ isIndexed: true }),
    status: (0, import_fields19.select)({
      type: "string",
      options: [
        { label: "Received", value: "received" },
        { label: "Processed", value: "processed" },
        { label: "Ignored", value: "ignored" },
        { label: "Failed", value: "failed" }
      ],
      defaultValue: "received"
    }),
    payload: (0, import_fields19.json)(),
    rawBody: (0, import_fields19.text)({ ui: { displayMode: "textarea" } }),
    error: (0, import_fields19.text)({ ui: { displayMode: "textarea" } }),
    attempts: (0, import_fields19.integer)({ defaultValue: 0 }),
    receivedAt: (0, import_fields19.timestamp)({ defaultValue: { kind: "now" }, isIndexed: true }),
    processedAt: (0, import_fields19.timestamp)(),
    payment: (0, import_fields19.relationship)({ ref: "Payment" }),
    ...trackingFields
  }
});

// features/keystone/models/ManagerApproval.ts
var import_core15 = require("@keystone-6/core");
var import_fields20 = require("@keystone-6/core/fields");
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
    actionType: (0, import_fields20.select)({
      type: "string",
      options: [
        { label: "Refund booking", value: "refund_booking" }
      ],
      validation: { isRequired: true },
      isIndexed: true
    }),
    targetId: (0, import_fields20.text)({ validation: { isRequired: true }, isIndexed: true }),
    reason: (0, import_fields20.text)({ validation: { isRequired: true }, ui: { displayMode: "textarea" } }),
    amount: (0, import_fields20.integer)(),
    requestFingerprint: (0, import_fields20.text)({ validation: { isRequired: true } }),
    requestPayload: (0, import_fields20.json)(),
    status: (0, import_fields20.select)({
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
    requestedAt: (0, import_fields20.timestamp)({ defaultValue: { kind: "now" }, isIndexed: true }),
    approvedAt: (0, import_fields20.timestamp)(),
    consumedAt: (0, import_fields20.timestamp)(),
    expiresAt: (0, import_fields20.timestamp)({ validation: { isRequired: true }, isIndexed: true }),
    consumedEntityType: (0, import_fields20.text)(),
    consumedEntityId: (0, import_fields20.text)(),
    requestedBy: (0, import_fields20.relationship)({ ref: "User" }),
    approvedBy: (0, import_fields20.relationship)({ ref: "User" }),
    ...trackingFields
  },
  ui: { isHidden: true }
});

// features/keystone/models/IdempotencyKey.ts
var import_core16 = require("@keystone-6/core");
var import_fields21 = require("@keystone-6/core/fields");
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
    idempotencyKey: (0, import_fields21.text)({
      isIndexed: "unique",
      validation: { isRequired: true }
    }),
    requestMethod: (0, import_fields21.text)({ validation: { isRequired: true } }),
    requestParams: (0, import_fields21.json)(),
    requestPath: (0, import_fields21.text)({ validation: { isRequired: true } }),
    responseCode: (0, import_fields21.integer)(),
    responseBody: (0, import_fields21.json)(),
    recoveryPoint: (0, import_fields21.text)({
      defaultValue: "started",
      validation: { isRequired: true }
    }),
    lockedAt: (0, import_fields21.timestamp)(),
    ...trackingFields
  }
});

// features/keystone/models/index.ts
var models = {
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
  Participant,
  WaiverTemplate,
  WaiverSignature,
  Channel,
  ChannelStatement,
  OperationalTask,
  NotificationPreference,
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
  ManagerApproval
};

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

// features/keystone/lib/tour-command.ts
var import_node_crypto3 = require("node:crypto");

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
async function findIdempotencyAttempt(prisma, request) {
  const key = request.key.trim();
  if (!key) throw new Error("Idempotency key is required");
  const existing = await prisma.idempotencyKey.findUnique({ where: { idempotencyKey: key } });
  if (existing) assertIdempotencyRequest(existing, { ...request, key });
  return existing;
}
async function getOrCreateIdempotencyAttempt(prisma, request) {
  const key = request.key.trim();
  if (!key) throw new Error("Idempotency key is required");
  const normalizedParams = canonicalIdempotencyParams(request.requestParams);
  const data = {
    idempotencyKey: key,
    requestMethod: request.requestMethod || "POST",
    requestPath: request.requestPath,
    requestParams: {
      ...normalizedParams,
      _fingerprint: idempotencyFingerprint(request.requestParams)
    },
    recoveryPoint: "started",
    lockedAt: /* @__PURE__ */ new Date()
  };
  const existing = await findIdempotencyAttempt(prisma, { ...request, key });
  if (existing) return { attempt: existing, replay: true };
  try {
    const attempt = await prisma.idempotencyKey.create({ data });
    return { attempt, replay: false };
  } catch (error) {
    if (error?.code !== "P2002") throw error;
    const raced = await prisma.idempotencyKey.findUnique({ where: { idempotencyKey: key } });
    if (!raced) throw error;
    assertIdempotencyRequest(raced, { ...request, key });
    return { attempt: raced, replay: true };
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
var hashToken = (token) => (0, import_node_crypto3.createHash)("sha256").update(token).digest("hex");
var ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
var humanCode = (length = 10) => Array.from((0, import_node_crypto3.randomBytes)(length), (b) => ALPHABET[b % ALPHABET.length]).join("");
var secret2 = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET of at least 32 characters is required");
  return s;
};
var derivedToken = (purpose, id) => (0, import_node_crypto3.createHmac)("sha256", secret2()).update(`${purpose}\0${id}`).digest("base64url");
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
  return context.prisma.$transaction(async (tx) => {
    for (const lock of [.../* @__PURE__ */ new Set([`idempotency:${scopedKey}`, ...locks])].sort()) await lockTransactionKey(tx, lock);
    const { attempt, replay } = await getOrCreateIdempotencyAttempt(tx, { key: scopedKey, requestPath: operation, requestParams: { ...params, actorId: context.session?.itemId || null } });
    if (replay && attempt.recoveryPoint === "completed") return attempt.responseBody;
    const result = await work(tx);
    await updateIdempotencyAttempt(tx, attempt.id, "completed", JSON.parse(JSON.stringify(result)), 200);
    return result;
  }, { timeout: 2e4 });
}
async function departureOccupancy(tx, departureId, excludeHoldId, channelId) {
  const now = /* @__PURE__ */ new Date();
  const departure = await tx.departure.findUnique({ where: { id: departureId }, include: { tour: true } });
  if (!departure) throw new Error("Departure not found");
  const [bookings, holds, channels] = await Promise.all([
    tx.booking.aggregate({ where: { departureId, status: { in: ["confirmed", "checked_in", "completed", "no_show"] } }, _sum: { seats: true } }),
    tx.inventoryHold.aggregate({ where: { departureId, status: "active", expiresAt: { gt: now }, ...excludeHoldId ? { id: { not: excludeHoldId } } : {} }, _sum: { quantity: true } }),
    departure.startAt.getTime() - now.getTime() > 864e5 ? tx.channel.findMany({ where: { active: true, allocation: { gt: 0 } } }) : []
  ]);
  let allocated = 0;
  for (const channel of channels) {
    if (channel.id === channelId) continue;
    const sold = await tx.booking.aggregate({ where: { departureId, channelId: channel.id, status: { in: ["confirmed", "checked_in", "completed", "no_show"] } }, _sum: { seats: true } });
    allocated += Math.max(0, channel.allocation - (sold._sum.seats || 0));
  }
  return { departure, booked: bookings._sum.seats || 0, held: holds._sum.quantity || 0, allocated, remaining: Math.max(0, departure.capacity - (bookings._sum.seats || 0) - (holds._sum.quantity || 0) - allocated) };
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

// features/keystone/mutations/tour-catalog.ts
async function releaseHoldPromos(tx, holdIds) {
  if (holdIds.length) await tx.promoRedemption.updateMany({ where: { holdId: { in: holdIds }, status: "reserved" }, data: { status: "released" } });
}
async function toursOnSale(_root, _args, context) {
  return context.prisma.tour.findMany({ where: { status: "active", departures: { some: { startAt: { gt: /* @__PURE__ */ new Date() }, status: { in: ["on_sale", "confirmed", "min_not_met"] } } } }, select: { id: true, name: true, slug: true, description: true, durationMinutes: true, images: true, kind: true, minAge: true, highlights: true, whatToBring: true, meetingPoint: { select: { name: true, address: true, instructions: true } }, addOns: { select: { id: true, name: true, priceCents: true, perPerson: true } }, requiresWaiverId: true, cancellationPolicy: { select: { rules: true, weatherFullRefund: true } }, ticketTypes: { where: { active: true }, select: { id: true, name: true, priceCents: true, currencyCode: true } } }, take: 100 });
}
async function tourAvailability(_root, args, context) {
  const from = new Date(args.from), to = new Date(args.to);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from || to.getTime() - from.getTime() > 92 * 864e5) throw new Error("Choose a valid date range of at most 92 days");
  const rows = await context.prisma.departure.findMany({ where: { tourId: args.tourId, tour: { status: "active" }, startAt: { gte: from, lte: to }, status: { in: ["on_sale", "confirmed", "min_not_met", "full"] } }, select: { id: true, startAt: true, endAt: true, capacity: true, bookingCutoffMinutes: true }, take: 500, orderBy: { startAt: "asc" } });
  const ids = rows.map((r) => r.id);
  const LIVE3 = ["confirmed", "checked_in", "completed", "no_show"];
  const [booked, held, channels, channelSold] = await Promise.all([
    context.prisma.booking.groupBy({ by: ["departureId"], where: { departureId: { in: ids }, status: { in: LIVE3 } }, _sum: { seats: true } }),
    context.prisma.inventoryHold.groupBy({ by: ["departureId"], where: { departureId: { in: ids }, status: "active", expiresAt: { gt: /* @__PURE__ */ new Date() } }, _sum: { quantity: true } }),
    context.prisma.channel.findMany({ where: { active: true, allocation: { gt: 0 } } }),
    context.prisma.booking.groupBy({ by: ["departureId", "channelId"], where: { departureId: { in: ids }, channelId: { not: null }, status: { in: LIVE3 } }, _sum: { seats: true } })
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
  const stale = await tx.inventoryHold.findMany({ where: { departureId: input.departureId, status: "active", expiresAt: { lte: /* @__PURE__ */ new Date() } }, select: { id: true } });
  if (stale.length) {
    await tx.inventoryHold.updateMany({ where: { id: { in: stale.map((h) => h.id) } }, data: { status: "expired" } });
    await releaseHoldPromos(tx, stale.map((h) => h.id));
    await tx.booking.updateMany({ where: { holdId: { in: stale.map((h) => h.id) }, status: "pending_payment" }, data: { status: "cancelled" } });
  }
  const o = await departureOccupancy(tx, input.departureId, void 0, channelId);
  const d = o.departure;
  if (d.tour.status !== "active" || !["on_sale", "confirmed", "min_not_met", "full"].includes(d.status) || d.startAt.getTime() - d.bookingCutoffMinutes * 6e4 <= Date.now()) throw new Error("Departure is not on sale");
  if (!Array.isArray(input.tickets) || !input.tickets.length || input.tickets.length > 20) throw new Error("Choose ticket quantities");
  const lines = [];
  let seats = 0;
  for (const chosen of input.tickets) {
    if (!Number.isSafeInteger(chosen.qty) || chosen.qty < 1 || chosen.qty > 100) throw new Error("Invalid quantity");
    const ticket = await tx.ticketType.findFirst({ where: { id: chosen.id, tourId: d.tourId, active: true } });
    if (!ticket) throw new Error("Ticket not offered on this tour");
    seats += ticket.countsTowardCapacity ? ticket.seatsUsed * chosen.qty : 0;
    lines.push({ catalogId: ticket.id, name: ticket.name, unitPriceCents: ticket.priceCents, qty: chosen.qty, seatsUsed: ticket.countsTowardCapacity ? ticket.seatsUsed : 0, kind: "ticket", minAge: ticket.minAge, maxAge: ticket.maxAge });
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
var import_node_crypto4 = require("node:crypto");

// features/integrations/payment/index.ts
var paymentProviderAdapters = {
  stripe: () => Promise.resolve().then(() => (init_stripe(), stripe_exports)),
  manual: () => Promise.resolve().then(() => (init_manual(), manual_exports))
};

// features/keystone/utils/paymentProviderAdapter.ts
var ADAPTERS = new Set(Object.keys(paymentProviderAdapters));
var ADAPTER_OPERATIONS = /* @__PURE__ */ new Set(["createPaymentFunction", "capturePaymentFunction", "refundPaymentFunction", "getPaymentStatusFunction", "generatePaymentLinkFunction", "handleWebhookFunction", "cancelPaymentFunction"]);
function paymentAdapterPayload(provider2, args) {
  const projectedProvider = { id: provider2.id, code: provider2.code, credentials: provider2.credentials || {} };
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
async function executeAdapterFunction({ provider: provider2, functionName, args }) {
  if (!ADAPTER_OPERATIONS.has(functionName)) throw new Error("Unknown payment adapter operation");
  const functionPath = provider2?.[functionName];
  if (typeof functionPath !== "string") throw new Error("Payment adapter is not configured");
  const payload = paymentAdapterPayload(provider2, args);
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
async function createPayment({ provider: provider2, cart, order, amount, currency: currency2, idempotencyKey }) {
  return executeAdapterFunction({
    provider: provider2,
    functionName: "createPaymentFunction",
    args: { cart, order, amount, currency: currency2, idempotencyKey }
  });
}
async function refundPayment({ provider: provider2, paymentId, amount, currency: currency2, idempotencyKey, refundId }) {
  return executeAdapterFunction({
    provider: provider2,
    functionName: "refundPaymentFunction",
    args: { paymentId, amount, currency: currency2, idempotencyKey, refundId }
  });
}
async function getPaymentStatus({ provider: provider2, paymentId }) {
  return executeAdapterFunction({
    provider: provider2,
    functionName: "getPaymentStatusFunction",
    args: { paymentId }
  });
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
var LIVE = ["confirmed", "checked_in", "completed", "no_show", "partially_refunded", "refunded"];
var norm = (s) => String(s || "").trim().toLowerCase();
async function provider(prisma) {
  const p = await prisma.paymentProvider.findFirst({ where: { code: "pp_stripe", isInstalled: true } });
  if (!p) throw new Error("Payment provider is not configured");
  return p;
}
async function refreshDepartureStatus(tx, departureId) {
  const o = await departureOccupancy(tx, departureId);
  const d = o.departure;
  if (!["scheduled", "on_sale", "min_not_met", "confirmed", "full"].includes(d.status)) return;
  const next = o.booked >= d.capacity ? "full" : o.booked >= d.tour.minParticipants ? "confirmed" : d.status === "min_not_met" ? "min_not_met" : "on_sale";
  if (next !== d.status) await tx.departure.update({ where: { id: d.id }, data: { status: next } });
}
function buildParticipants(quote, input) {
  const tickets = quote.lines.filter((l) => l.kind === "ticket");
  const total = tickets.reduce((n, l) => n + l.qty, 0);
  if (!Array.isArray(input) || input.length !== total) throw new Error("Provide one participant per ticket");
  const remaining = new Map(tickets.map((l) => [l.catalogId, l.qty]));
  return input.map((p) => {
    const line = tickets.find((l) => l.catalogId === p.ticketTypeId);
    if (!line || !(remaining.get(line.catalogId) > 0)) throw new Error("Participants do not match selected tickets");
    remaining.set(line.catalogId, remaining.get(line.catalogId) - 1);
    const name3 = String(p.fullName || "").trim();
    if (!name3 || name3.length > 120) throw new Error("Participant name required");
    if (p.age !== void 0 && p.age !== null && (line.minAge != null && p.age < line.minAge || line.maxAge != null && p.age > line.maxAge)) throw new Error(`${name3} does not meet the age range for ${line.name}`);
    return { fullName: name3, age: p.age ?? null, email: String(p.email || "").trim(), dietary: String(p.dietary || ""), medicalNotes: String(p.medicalNotes || ""), snapshot: { ticketTypeId: line.catalogId, name: line.name, unitPriceCents: line.unitPriceCents } };
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
    guestEmail: norm(a.lead.email),
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
  for (const p of a.participants) {
    const row = await tx.participant.create({ data: { bookingId: booking.id, fullName: p.fullName, age: p.age, email: p.email, dietary: p.dietary, medicalNotes: p.medicalNotes, ticketTypeSnapshot: p.snapshot, waiverStatus: q.tour.waiverTemplateId ? "required" : "not_required" } });
    if (q.tour.waiverTemplateId) await tx.participant.update({ where: { id: row.id }, data: { waiverTokenHash: hashToken(derivedToken("waiver", row.id)) } });
  }
  return booking;
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
  await refreshDepartureStatus(tx, booking.departureId);
  await audit(tx, actorId, "booking.confirmed", "Booking", booking.id, { status: booking.status }, { status: "confirmed", seats }, "", requestId);
  return tx.booking.findUnique({ where: { id: booking.id } });
}
async function waiverLinks(prisma, bookingId) {
  const ps = await prisma.participant.findMany({ where: { bookingId, waiverStatus: "required" }, select: { id: true, fullName: true } });
  return ps.map((p) => ({ participantId: p.id, fullName: p.fullName, token: derivedToken("waiver", p.id) }));
}
async function startBookingCheckout(_r, args, context) {
  const i = args.input;
  if (!i.token) throw new Error("Booking not found");
  const hold = await context.prisma.inventoryHold.findUnique({ where: { id: i.holdId } });
  if (!hold) throw new Error("Booking not found");
  assertProof(i.token, hold.cartTokenHash);
  const prov = await provider(context.prisma);
  const b = await context.prisma.$transaction(async (tx) => {
    await lockTransactionKey(tx, `departure:${hold.departureId}`);
    const h = await tx.inventoryHold.findUnique({ where: { id: hold.id } });
    const existing = await tx.booking.findUnique({ where: { holdId: h.id }, include: { paymentCollection: { include: { paymentSessions: true } } } });
    if (existing) return existing;
    if (h.status !== "active" || h.expiresAt <= /* @__PURE__ */ new Date()) throw new Error("Hold expired; choose seats again");
    const quote = { ...h.quote, departureId: h.departureId };
    const participants = buildParticipants(quote, i.participants);
    const booking = await newBooking(tx, { quote, lead: i.lead, participants, source: "online", holdId: h.id, customerId: context.session?.itemId, status: "pending_payment" });
    await tx.inventoryHold.update({ where: { id: h.id }, data: { expiresAt: new Date(Date.now() + 15 * 6e4) } });
    const collection = await tx.paymentCollection.create({ data: { amount: quote.totalCents, description: "default" } });
    await tx.booking.update({ where: { id: booking.id }, data: { paymentCollectionId: collection.id } });
    await tx.paymentSession.create({ data: { paymentCollectionId: collection.id, paymentProviderId: prov.id, amount: quote.totalCents, isSelected: true, idempotencyKey: (0, import_node_crypto4.createHash)("sha256").update(`tour-checkout:${h.id}`).digest("hex"), data: { state: "initializing" } } });
    await audit(tx, context.session?.itemId || null, "booking.checkout_started", "Booking", booking.id, null, { totalCents: quote.totalCents }, "", args.idempotencyKey);
    return tx.booking.findUnique({ where: { id: booking.id }, include: { paymentCollection: { include: { paymentSessions: true } } } });
  }, { timeout: 2e4 });
  const session = b.paymentCollection.paymentSessions[0];
  if (b.totalCents === 0) return { bookingRef: b.bookingRef, clientSecret: null, publishableKey: null, totalCents: 0, currencyCode: b.currencyCode };
  let data = session.data || {};
  if (!data.paymentIntentId) {
    const created = await createPayment({ provider: prov, order: { id: b.id, orderNumber: b.bookingRef }, amount: b.totalCents, currency: b.currencyCode, idempotencyKey: session.idempotencyKey });
    data = { state: "ready", paymentIntentId: created.paymentIntentId, clientSecret: created.clientSecret };
    await context.prisma.paymentSession.update({ where: { id: session.id }, data: { isInitiated: true, data } });
  }
  return { bookingRef: b.bookingRef, clientSecret: data.clientSecret, publishableKey: getPublicPaymentProviderConfig(prov.code)?.publishableKey || null, totalCents: b.totalCents, currencyCode: b.currencyCode };
}
async function finalizeBookingPayment(prisma, bookingId, actorId, requestId) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { paymentCollection: { include: { paymentSessions: { include: { paymentProvider: true } } } } } });
  if (!booking) throw new Error("Booking not found");
  if (booking.status !== "pending_payment") return booking;
  const session = booking.paymentCollection?.paymentSessions?.find((s) => s.isSelected);
  let observed = null;
  if (booking.totalCents > 0) {
    if (!session?.data?.paymentIntentId) throw new Error("Payment has not started");
    observed = await getPaymentStatus({ provider: session.paymentProvider, paymentId: session.data.paymentIntentId });
    if (observed.status !== "succeeded") throw new Error("Payment not completed");
    if (observed.amount !== booking.totalCents || String(observed.currencyCode).toUpperCase() !== booking.currencyCode) throw new Error("Payment amount does not match the booking; operator reconciliation required");
  }
  let needRefund = false;
  const confirmed = await prisma.$transaction(async (tx) => {
    await lockTransactionKey(tx, `departure:${booking.departureId}`);
    const result = await confirmBooking(tx, booking.id, actorId, requestId);
    if (!result) {
      needRefund = true;
      await tx.booking.update({ where: { id: booking.id }, data: { status: "cancelled" } });
    }
    if (booking.totalCents > 0) {
      await tx.payment.create({ data: { idempotencyKey: `tour-payment:${booking.id}`, amount: booking.totalCents, currencyCode: booking.currencyCode, status: "succeeded", paymentMethod: "credit_card", paymentProviderId: session.paymentProviderId, providerPaymentId: session.data.paymentIntentId, orderId: booking.id, paymentCollectionId: booking.paymentCollectionId, processedAt: /* @__PURE__ */ new Date(), data: { paymentIntentId: session.data.paymentIntentId } } });
      await tx.paymentCollection.update({ where: { id: booking.paymentCollectionId }, data: { authorizedAmount: booking.totalCents } });
      await tx.paymentSession.update({ where: { id: session.id }, data: { paymentAuthorizedAt: /* @__PURE__ */ new Date(), data: { ...session.data, state: "captured" } } });
    }
    return result;
  }, { timeout: 2e4 });
  if (needRefund) {
    await issueRefund(prisma, { bookingId: booking.id, amount: booking.totalCents, reason: "Seats no longer available after payment", key: `late-pay:${booking.id}`, actorId: null, cancel: true });
    throw new Error("Seats were no longer available; payment refunded");
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
    participants: full.participants.map((p) => ({ participantId: p.id, fullName: p.fullName, waiverStatus: p.waiverStatus, checkInStatus: p.checkInStatus })),
    refundIfCancelledCents: ["confirmed"].includes(full.status) ? refundPolicyAmount(full.totalCents - full.refundedCents, full.policySnapshot?.rules || [], (full.departure.startAt.getTime() - Date.now()) / 36e5) : 0,
    waivers: ["confirmed", "checked_in"].includes(full.status) ? await waiverLinks(prisma, full.id) : []
  };
}
async function lookupBooking(_r, args, context) {
  const booking = await context.prisma.booking.findUnique({ where: { bookingRef: String(args.bookingRef || "").trim().toUpperCase() } });
  if (!booking || norm(booking.guestEmail) !== norm(args.email)) throw new Error("Booking not found");
  return bookingView(context.prisma, booking);
}
async function issueRefund(prisma, a) {
  const reservation = await prisma.$transaction(async (tx) => {
    const b = await tx.booking.findUnique({ where: { id: a.bookingId } });
    await lockTransactionKey(tx, `departure:${b.departureId}`);
    const existing = await tx.refund.findUnique({ where: { idempotencyKey: a.key } });
    if (existing) return { refund: existing, replay: true };
    const payment2 = await tx.payment.findFirst({ where: { orderId: b.id, status: { in: ["succeeded", "partially_refunded"] } }, include: { paymentProvider: true } });
    const live = await tx.booking.findUnique({ where: { id: b.id } });
    if (!payment2) {
      if (a.amount === 0 || live.totalCents === 0 || live.channelId) return { refund: null, payment: null, booking: live };
      throw new Error("No captured payment to refund");
    }
    if (!Number.isSafeInteger(a.amount) || a.amount < 0 || a.amount > payment2.amount - (payment2.refundedAmount || 0)) throw new Error("Refund exceeds captured amount");
    if (a.amount === 0) return { refund: null, payment: payment2, booking: live };
    const refund2 = await tx.refund.create({ data: { idempotencyKey: a.key, amount: a.amount, currencyCode: payment2.currencyCode, status: "processing", reason: a.reason || "Refund", paymentId: payment2.id, orderId: b.id, requestedById: a.requestedById || a.actorId, approvedById: a.approvalId ? (await tx.managerApproval.findUnique({ where: { id: a.approvalId } }))?.approvedById : null } });
    await audit(tx, a.actorId, "refund.reserved", "Refund", refund2.id, null, { amount: a.amount }, a.reason, a.key);
    return { refund: refund2, payment: payment2, booking: live };
  }, { timeout: 2e4 });
  if (reservation.replay && reservation.refund.status === "succeeded") return reservation.refund;
  const { refund, payment } = reservation;
  let outcome = { status: "succeeded", id: "" };
  const operatorTender = !!payment && (payment.paymentMethod === "cash" || !payment.providerPaymentId);
  if (refund && operatorTender) outcome = { status: "succeeded", id: `manual:${refund.id}` };
  else if (refund) {
    try {
      const prov = payment.paymentProvider || await provider(prisma);
      const result = await refundPayment({ provider: prov, paymentId: payment.providerPaymentId, amount: refund.amount, currency: refund.currencyCode, idempotencyKey: refund.idempotencyKey });
      outcome = { status: result.status === "succeeded" ? "succeeded" : result.status === "failed" ? "failed" : "unknown", id: result.id || result.refundId, data: result.data };
    } catch {
      outcome = { status: "unknown", id: "" };
    }
  }
  return prisma.$transaction(async (tx) => {
    const b = await tx.booking.findUnique({ where: { id: a.bookingId } });
    await lockTransactionKey(tx, `departure:${b.departureId}`);
    if (refund) {
      const current = await tx.refund.findUnique({ where: { id: refund.id } });
      if (current.status === "succeeded") return current;
      await tx.refund.update({ where: { id: refund.id }, data: { status: outcome.status, providerRefundId: outcome.id || "", processedAt: outcome.status === "succeeded" ? /* @__PURE__ */ new Date() : null } });
      if (outcome.status === "succeeded") {
        const p = await tx.payment.findUnique({ where: { id: payment.id } });
        const total = (p.refundedAmount || 0) + refund.amount;
        await tx.payment.update({ where: { id: p.id }, data: { refundedAmount: total, status: total >= p.amount ? "refunded" : "partially_refunded" } });
        if (b.paymentCollectionId) await tx.paymentCollection.update({ where: { id: b.paymentCollectionId }, data: { refundedAmount: { increment: refund.amount } } });
      }
    }
    if (!refund || outcome.status === "succeeded") {
      const refunded = (b.refundedCents || 0) + (refund ? refund.amount : 0);
      const data = { refundedCents: refunded };
      if (a.cancel) {
        data.status = refunded >= b.totalCents && b.totalCents > 0 ? "refunded" : "cancelled";
        data.seats = 0;
        if (b.totalCents === 0) data.status = "cancelled";
      } else if (refunded > 0) data.status = refunded >= b.totalCents ? "refunded" : "partially_refunded";
      if (data.status === "refunded" && !a.cancel) data.seats = b.seats;
      await tx.booking.update({ where: { id: b.id }, data });
      if (a.cancel) {
        await tx.promoRedemption.updateMany({ where: { bookingId: b.id, status: "committed" }, data: { status: "released" } });
        await refreshDepartureStatus(tx, b.departureId);
      }
      await audit(tx, a.actorId, a.cancel ? "booking.cancelled" : "booking.refunded", "Booking", b.id, { status: b.status, refundedCents: b.refundedCents }, data, a.reason, a.key);
    } else await audit(tx, a.actorId, "refund.unresolved", "Refund", refund.id, null, { status: outcome.status }, "Reconcile with the provider before retrying", a.key);
    return refund ? tx.refund.findUnique({ where: { id: refund.id } }) : { status: "succeeded", amount: 0 };
  }, { timeout: 2e4 });
}
async function cancelMyBooking(_r, args, context) {
  const booking = await context.prisma.booking.findUnique({ where: { bookingRef: String(args.bookingRef || "").trim().toUpperCase() }, include: { departure: true } });
  if (!booking || norm(booking.guestEmail) !== norm(args.email)) throw new Error("Booking not found");
  if (booking.status !== "confirmed") throw new Error("Only confirmed bookings can be cancelled");
  if (booking.departure.startAt <= /* @__PURE__ */ new Date()) throw new Error("Departure has started");
  const refundable = booking.totalCents - booking.refundedCents;
  const amount = refundPolicyAmount(refundable, booking.policySnapshot?.rules || [], (booking.departure.startAt.getTime() - Date.now()) / 36e5);
  await issueRefund(context.prisma, { bookingId: booking.id, amount, reason: "Guest cancellation per policy", key: `cancel:${booking.id}:${args.idempotencyKey}`, actorId: null, cancel: true });
  return bookingView(context.prisma, booking);
}
async function requestRefundApproval(root, args, context) {
  await authorize(context, "canIssueRefunds");
  return requestManagerApproval(root, { actionType: "refund_booking", targetId: args.bookingId, reason: args.reason, amount: args.amount }, context);
}
async function approveRefund(root, args, context) {
  await authorize(context, "canIssueRefunds");
  return approveManagerApproval(root, { approvalId: args.approvalId }, context);
}
async function refundBooking(_r, args, context) {
  const user = await authorize(context, "canIssueRefunds");
  const i = args.input;
  const booking = await context.prisma.booking.findUnique({ where: { id: i.bookingId } });
  if (!booking || !LIVE.includes(booking.status)) throw new Error("Booking cannot be refunded");
  const settings = await context.prisma.storeSettings.findFirst();
  const needsApproval = i.amountCents > (settings?.refundApprovalThresholdCents ?? 1e4);
  if (!i.reason?.trim()) throw new Error("Reason required");
  if (needsApproval) {
    await context.prisma.$transaction(async (tx) => consumeManagerApproval(tx, { actionType: "refund_booking", targetId: booking.id, reason: i.reason, amount: i.amountCents, approvalId: i.approvalId, actorId: user.id, entityType: "Booking", entityId: booking.id }), { isolationLevel: "Serializable" });
  }
  await issueRefund(context.prisma, { bookingId: booking.id, amount: i.amountCents, reason: i.reason, key: `refund:${args.idempotencyKey}`, actorId: user.id, cancel: !!i.cancelBooking, approvalId: i.approvalId });
  return { bookingRef: booking.bookingRef };
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
      await tx.departure.update({ where: { id: d.id }, data: { status } });
      await tx.inventoryHold.updateMany({ where: { departureId: d.id, status: "active" }, data: { status: "released" } });
      const holds = await tx.inventoryHold.findMany({ where: { departureId: d.id, status: "released" }, select: { id: true } });
      await tx.promoRedemption.updateMany({ where: { holdId: { in: holds.map((h) => h.id) }, status: "reserved" }, data: { status: "released" } });
      await tx.booking.updateMany({ where: { departureId: d.id, status: "pending_payment" }, data: { status: "cancelled" } });
      await tx.guideAssignment.updateMany({ where: { departureId: d.id, status: { in: ["offered", "accepted"] } }, data: { status: "cancelled" } });
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
    const participants = old.participants.map((p) => ({ fullName: p.fullName, age: p.age, email: p.email, dietary: p.dietary, medicalNotes: p.medicalNotes, snapshot: p.ticketTypeSnapshot }));
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
  return command(context, args.idempotencyKey, "createChannelBooking", i, [`departure:${i.departureId}`], async (tx) => {
    let channel = null;
    if (i.source === "reseller") {
      channel = await tx.channel.findUnique({ where: { id: i.channelId } });
      if (!channel?.active) throw new Error("Channel unavailable");
    }
    const hold = await placeHold(tx, { ...i, token: derivedToken("operator-hold", args.idempotencyKey + ":" + i.departureId) }, user.id, args.idempotencyKey, channel?.id, 6e4);
    const quote = { ...hold.quote, departureId: i.departureId };
    const participants = buildParticipants(quote, i.participants);
    const booking = await newBooking(tx, { quote, lead: i.lead, participants, source: i.source, channel, holdId: hold.holdId, status: "pending_payment" });
    const confirmed = await confirmBooking(tx, booking.id, user.id, args.idempotencyKey);
    if (quote.totalCents > 0 && !(channel && channel.paymentModel === "channel_collects")) {
      await tx.payment.create({ data: { idempotencyKey: `tour-payment:${booking.id}`, amount: quote.totalCents, currencyCode: quote.currencyCode, status: "succeeded", paymentMethod: i.paymentMethod === "cash" ? "cash" : "credit_card", orderId: booking.id, processedAt: /* @__PURE__ */ new Date(), processedById: user.id, notes: "Collected by operator" } });
    }
    return { bookingRef: confirmed.bookingRef, waivers: [] };
  });
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
  const bodyHash = (0, import_node_crypto4.createHash)("sha256").update(JSON.stringify(template.body)).digest("hex");
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
    const rows = await tx.departure.findMany({ where: { status: { in: ["on_sale", "min_not_met", "confirmed", "full"] }, startAt: { gt: /* @__PURE__ */ new Date(), lt: new Date(Date.now() + 864e5 + 36e5) } }, include: { tour: true }, take: 500 });
    let tasks = 0, closed = 0;
    for (const d of rows) {
      await lockTransactionKey(tx, `departure:${d.id}`);
      const o = await departureOccupancy(tx, d.id);
      const decision = minimumDecision(o.booked, d.tour.minParticipants, d.startAt);
      if (decision.needsDecision) {
        await tx.departure.update({ where: { id: d.id }, data: { status: "min_not_met" } });
        const key = `min:${d.id}`;
        if (!await tx.operationalTask.findUnique({ where: { taskKey: key } })) {
          await tx.operationalTask.create({ data: { name: "Run or cancel: minimum not met", departureId: d.id, taskKey: key, status: "open" } });
          tasks++;
        }
      }
      if (d.startAt.getTime() - d.bookingCutoffMinutes * 6e4 <= Date.now()) {
        await tx.departure.update({ where: { id: d.id }, data: { status: "closed" } });
        closed++;
      }
    }
    await audit(tx, user.id, "departures.swept", "Departure", "sweep", null, { tasks, closed });
    return { tasks, closed };
  });
}
async function checkoutHold(_r, args, context) {
  const hold = await context.prisma.inventoryHold.findUnique({ where: { id: args.holdId }, include: { booking: true } });
  if (!hold) throw new Error("Booking not found");
  assertProof(String(args.token || ""), hold.cartTokenHash);
  return { id: hold.id, status: hold.status, expiresAt: hold.expiresAt, quote: hold.quote, bookingRef: hold.booking?.bookingRef || null };
}

// features/keystone/lib/resourceCapacity.ts
function milliseconds(value) {
  const date = value instanceof Date ? value : new Date(value);
  return date.getTime();
}
function peakConcurrentResourceUnits(allocations, options = {}) {
  const hasStart = options.startsAt !== void 0;
  const hasEnd = options.endsAt !== void 0;
  if (hasStart !== hasEnd) return null;
  const windowStart = hasStart ? milliseconds(options.startsAt) : Number.NEGATIVE_INFINITY;
  const windowEnd = hasEnd ? milliseconds(options.endsAt) : Number.POSITIVE_INFINITY;
  const nowMs = options.nowMs ?? Date.now();
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
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    const represented = (/* @__PURE__ */ new Date(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`)).getTime();
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
      for (const name3 of a.departure.tour.requiredCertifications || []) if (!a.guide.certifications.some((c) => c.name === name3 && (!c.expiresAt || c.expiresAt > a.departure.endAt))) throw new Error("Required certification expired");
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
    return result;
  });
}
async function checkInParticipant(_r, args, context) {
  await authorize(context, "canCheckIn");
  const i = args.input;
  const participant = await context.prisma.participant.findUnique({ where: { id: i.participantId }, include: { booking: true } });
  if (!participant) throw new Error("Participant not found");
  return command(context, args.idempotencyKey, "checkInParticipant", i, [`departure:${participant.booking.departureId}`], async (tx) => {
    const p = await tx.participant.findUnique({ where: { id: participant.id }, include: { booking: true } });
    if (!["confirmed", "checked_in"].includes(p.booking.status)) throw new Error("Booking is not confirmed");
    await tx.participant.update({ where: { id: p.id }, data: { checkInStatus: "checked_in" } });
    const pending = await tx.participant.count({ where: { bookingId: p.bookingId, checkInStatus: { not: "checked_in" } } });
    if (!pending) await tx.booking.updateMany({ where: { id: p.bookingId, status: "confirmed" }, data: { status: "checked_in" } });
    await audit(tx, context.session.itemId, "participant.checked_in", "Participant", p.id, { status: p.checkInStatus }, { status: "checked_in" });
    return { id: p.id, waiverWarning: p.waiverStatus === "required" };
  });
}
async function markNoShow(_r, args, context) {
  await authorize(context, "canCheckIn");
  const i = args.input;
  const booking = await context.prisma.booking.findUnique({ where: { id: i.bookingId } });
  if (!booking) throw new Error("Booking not found");
  return command(context, args.idempotencyKey, "markNoShow", i, [`departure:${booking.departureId}`], async (tx) => {
    const change = await tx.booking.updateMany({ where: { id: booking.id, status: "confirmed" }, data: { status: "no_show" } });
    if (change.count !== 1) throw new Error("Only confirmed bookings can be marked no show");
    await tx.participant.updateMany({ where: { bookingId: booking.id, checkInStatus: "pending" }, data: { checkInStatus: "no_show" } });
    await audit(tx, context.session.itemId, "booking.no_show", "Booking", booking.id, { status: "confirmed" }, { status: "no_show" });
    return { id: booking.id };
  });
}
async function closeDeparture(_r, args, context) {
  await authorize(context, "canManageDepartures");
  const i = args.input;
  return command(context, args.idempotencyKey, "closeDeparture", i, [`departure:${i.departureId}`], async (tx) => {
    const d = await tx.departure.findUnique({ where: { id: i.departureId }, include: { assignedGuides: true } });
    if (!d || !["closed", "in_progress"].includes(d.status) || d.endAt > /* @__PURE__ */ new Date()) throw new Error("Only an ended closed/in-progress departure can complete");
    await tx.departure.update({ where: { id: d.id }, data: { status: "completed" } });
    const toComplete = await tx.booking.findMany({ where: { departureId: d.id, status: "checked_in" }, include: { channel: true, payments: { where: { status: { in: ["succeeded", "partially_refunded", "refunded"] } } } } });
    for (const b of toComplete) {
      const paid = b.payments.reduce((n, p) => n + p.amount - (p.refundedAmount || 0), 0);
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
    const bookings = await tx.booking.findMany({ where: { channelId: channel.id, statementId: null, createdAt: { gte: from, lt: to }, status: { in: ["confirmed", "completed", "checked_in", "no_show", "partially_refunded", "cancelled"] } } });
    const grossCents = bookings.reduce((n, b) => n + b.totalCents - b.refundedCents, 0);
    const commissionCents = bookings.reduce((n, b) => n + settlement(b.totalCents - b.refundedCents, b.totalCents ? Math.round(b.channelCommissionCents * 1e4 / b.totalCents) : 0).commissionCents, 0);
    const statement = await tx.channelStatement.create({ data: { statementKey: `${channel.id}:${from.toISOString()}:${to.toISOString()}`, channelId: channel.id, periodStart: from, periodEnd: to, grossCents, commissionCents, netDueCents: channel.paymentModel === "channel_collects" ? grossCents - commissionCents : -commissionCents, status: "open" } });
    await tx.booking.updateMany({ where: { id: { in: bookings.map((b) => b.id) } }, data: { statementId: statement.id } });
    await audit(tx, context.session.itemId, "channel.statement_created", "ChannelStatement", statement.id, null, { grossCents, commissionCents });
    return statement;
  });
}

// features/keystone/mutations/tour-onboarding.ts
var ENTITIES = ["settings", "paymentProvider", "role", "meetingPoint", "cancellationPolicy", "waiver", "promoCode", "channel", "resource", "guide", "tour"];
async function ensureTourOnboardingRecord(_r, { entity, data }, context) {
  await authorize(context, "canManageOnboarding");
  if (!ENTITIES.includes(entity) || !data || typeof data !== "object") throw new Error("Unsupported setup record");
  const p = context.prisma;
  const ensure = async (model, where, create) => await p[model].findFirst({ where }) || p[model].create({ data: create });
  switch (entity) {
    case "settings": {
      const row = await ensure("storeSettings", { settingsKey: "operator" }, { ...data, settingsKey: "operator" });
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
      let row = await p.guide.findFirst({ where: { name: data.name } });
      if (!row) {
        row = await p.guide.create({ data: { name: data.name, languages: data.languages, payRateType: data.payRateType, payRateCents: data.payRateCents, status: "active", bio: data.bio || "" } });
        for (const cert of data.certs) await p.guideCertification.create({ data: { guideId: row.id, name: cert, expiresAt: data.expiringCert === cert ? new Date(Date.now() + 20 * 864e5) : new Date(Date.now() + 700 * 864e5) } });
      }
      return { id: row.id };
    }
    case "tour": {
      let tour = await p.tour.findUnique({ where: { slug: data.slug } });
      if (!tour) {
        tour = await p.tour.create({ data: {
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
        await p.schedule.create({ data: { name: `${data.name} schedule`, tourId: tour.id, rrule: data.rrule, startTimes: data.startTimes } });
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
  const p = context.prisma;
  const full = template === "full";
  const tours = await p.tour.findMany({ where: { status: "active" }, include: { schedules: true, ticketTypes: true } });
  const wanted = full ? tours : tours.filter((t) => seed.tours.find((x) => x.slug === t.slug)?.minimal);
  const now = /* @__PURE__ */ new Date();
  const horizon = new Date(now.getTime() + (full ? 21 : 3) * 864e5);
  let created = 0;
  for (const tour of wanted) for (const schedule of tour.schedules) {
    const starts = expandSchedule(schedule, tour, now, horizon).slice(0, full ? 400 : 3);
    for (const startAt of starts) {
      const key = `${tour.id}:${startAt.toISOString()}`;
      if (!await p.departure.findUnique({ where: { departureKey: key } })) {
        await p.departure.create({ data: departureData(schedule, tour, startAt, key) });
        created++;
      }
    }
  }
  const departures = await p.departure.findMany({ where: { startAt: { gt: now }, status: { in: ["on_sale", "confirmed", "min_not_met", "full"] } }, include: { tour: true }, orderBy: { startAt: "asc" }, take: 400 });
  if (!full) return { departures: created, bookings: 0 };
  const guides = await p.guide.findMany({ orderBy: { name: "asc" } });
  const resources = await p.resource.findMany();
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
  const channels = await p.channel.findMany();
  const names = seed.guestNames;
  const sellable = departures.filter((d) => d.tour.slug !== "private-ghost-tour" || next() > 0.5);
  for (let n = 0; bookings < (seed.bookingTarget || 60) && n < 400; n++) {
    const d = sellable[Math.floor(next() * Math.min(sellable.length, 90))];
    if (!d) break;
    const tickets = await p.ticketType.findMany({ where: { tourId: d.tourId } });
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
  const soon = await p.participant.findMany({ where: { booking: { status: "confirmed", departure: { startAt: { lt: new Date(now.getTime() + 36 * 36e5) } } } }, take: 6 });
  for (const part of soon) {
    try {
      await checkInParticipant(null, { input: { participantId: part.id }, idempotencyKey: idem(`ci:${part.id}`) }, context);
    } catch {
    }
  }
  const target = departures.find((d) => d.tour.slug === "dolphin-boat" && d.startAt.getTime() - now.getTime() > 5 * 864e5);
  if (target) {
    for (let i = 0; i < 3; i++) {
      const t = (await p.ticketType.findMany({ where: { tourId: target.tourId } }))[0];
      try {
        await createChannelBooking(null, { idempotencyKey: idem(`weather:${i}`), input: { departureId: target.id, source: "phone", paymentMethod: "cash", tickets: [{ id: t.id, qty: 2 }], lead: { name: names[i], email: `weather${i}@guests.example` }, participants: [0, 1].map((k) => ({ ticketTypeId: t.id, fullName: `${names[i]} ${k}`, age: 30 })) } }, context);
      } catch {
      }
    }
    await cancelDepartureCore(p, user.id, { departureId: target.id, reason: "weather" }, idem("weather-cancel"));
  }
  const history = tours.slice(0, 4);
  for (let h = 0; h < history.length; h++) {
    const tour = history[h];
    const startAt = new Date(now.getTime() - (h + 2) * 864e5);
    startAt.setMinutes(0, 0, 0);
    const key = `history:${tour.id}:${startAt.toISOString()}`;
    if (await p.departure.findUnique({ where: { departureKey: key } })) continue;
    const dep = await p.departure.create({ data: { departureKey: key, tourId: tour.id, startAt, endAt: new Date(startAt.getTime() + tour.durationMinutes * 6e4), capacity: tour.maxParticipants, status: "completed" } });
    const guide = guides[h % guides.length];
    const payout = await p.guidePayout.create({ data: { guideId: guide.id, periodStart: dep.startAt, periodEnd: dep.endAt, totalCents: guide.payRateCents, status: "draft" } });
    await p.guideAssignment.create({ data: { departureId: dep.id, guideId: guide.id, role: "lead", status: "worked", payCents: guide.payRateCents, payoutId: payout.id } });
    const ticket = tour.ticketTypes[0];
    for (let b = 0; b < 2; b++) {
      const total = ticket.priceCents * 2;
      const booking = await p.booking.create({ data: { bookingRef: `TG-${humanCode(8)}`, departureId: dep.id, guestName: names[(h * 2 + b) % names.length], guestEmail: `past${h}${b}@guests.example`, status: "completed", source: "phone", subtotalCents: total, totalCents: total, seats: 2 * ticket.seatsUsed, policySnapshot: { rules: [] }, tourSnapshot: { name: tour.name, timezone: tour.timezone }, lines: { create: [{ name: ticket.name, unitPriceCents: ticket.priceCents, qty: 2, seatsUsed: ticket.seatsUsed, kind: "ticket", totalCents: total, catalogId: ticket.id }] } } });
      for (let k = 0; k < 2; k++) await p.participant.create({ data: { bookingId: booking.id, fullName: `${booking.guestName} ${k}`, waiverStatus: "not_required", checkInStatus: "checked_in", ticketTypeSnapshot: { name: ticket.name } } });
      await p.payment.create({ data: { idempotencyKey: `seed-history:${booking.id}`, amount: total, status: "succeeded", paymentMethod: "cash", orderId: booking.id, processedAt: startAt, notes: "Collected by operator" } });
    }
  }
  await p.$transaction((tx) => audit(tx, user.id, "onboarding.activity_seeded", "Departure", "seed", null, { bookings }));
  return { departures: created, bookings };
}

// features/keystone/mutations/tour-manifest.ts
var LIVE2 = ["confirmed", "checked_in", "completed", "no_show", "partially_refunded"];
async function departuresInRange(_r, args, context) {
  await authorize(context, "canCheckIn");
  const from = new Date(args.from), to = new Date(args.to);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from || to.getTime() - from.getTime() > 31 * 864e5) throw new Error("Choose a range of at most 31 days");
  const rows = await context.prisma.departure.findMany({
    where: { startAt: { gte: from, lt: to } },
    orderBy: { startAt: "asc" },
    take: 300,
    include: { tour: { select: { id: true, name: true, guideRatio: true, minParticipants: true, requiresWaiverId: true } }, assignedGuides: { include: { guide: { select: { id: true, name: true } } } }, resourceAssignments: { include: { resource: { select: { name: true } } } } }
  });
  const out = [];
  for (const d of rows) {
    const [booked, held, gaps] = await Promise.all([
      context.prisma.booking.aggregate({ where: { departureId: d.id, status: { in: LIVE2 } }, _sum: { seats: true }, _count: true }),
      context.prisma.inventoryHold.aggregate({ where: { departureId: d.id, status: "active", expiresAt: { gt: /* @__PURE__ */ new Date() } }, _sum: { quantity: true } }),
      context.prisma.participant.count({ where: { waiverStatus: "required", booking: { departureId: d.id, status: { in: LIVE2 } } } })
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
  const d = await context.prisma.departure.findUnique({ where: { id: args.departureId }, include: { tour: { include: { meetingPoint: true } } } });
  if (!d) throw new Error("Departure not found");
  const bookings = await context.prisma.booking.findMany({ where: { departureId: d.id, status: { in: LIVE2 } }, orderBy: { bookingRef: "asc" }, include: { participants: true } });
  if (canMedical && bookings.some((b) => b.participants.some((p) => p.medicalNotes))) {
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
      participants: b.participants.map((p) => ({ id: p.id, fullName: p.fullName, age: p.age, dietary: p.dietary, medicalFlag: !!p.medicalNotes, medicalNotes: canMedical ? p.medicalNotes : null, waiverStatus: p.waiverStatus, checkInStatus: p.checkInStatus }))
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
      input StartBookingCheckoutInput { holdId: ID!, token: String!, lead: BookingLeadInput!, participants: [BookingParticipantInput!]! }
      input CompleteBookingCheckoutInput { bookingRef: String!, token: String! }
      input ChannelBookingInput { departureId: ID!, source: String!, channelId: ID, paymentMethod: String, tickets: [TourTicketChoice!]!, addOns: [TourTicketChoice!], promoCode: String, lead: BookingLeadInput!, participants: [BookingParticipantInput!]! }
      input SignWaiverInput { token: String!, signerName: String!, isGuardian: Boolean, minorName: String }
      input RefundBookingInput { bookingId: ID!, amountCents: Int!, reason: String!, approvalId: ID, cancelBooking: Boolean }
      input CancelDepartureInput { departureId: ID!, reason: String!, offerCredit: Boolean }
      input RebookInput { token: String!, departureId: ID! }
      input GenerateDeparturesInput { tourId: ID, days: Int }
      input AssignGuideInput { departureId: ID!, guideId: ID!, role: String }
      input RespondAssignmentInput { assignmentId: ID!, status: String! }
      input AssignResourceInput { departureId: ID!, resourceId: ID!, quantity: Int! }
      input ResizeDepartureInput { departureId: ID!, capacity: Int! }
      input ParticipantActionInput { participantId: ID! }
      input BookingActionInput { bookingId: ID! }
      input CloseDepartureInput { departureId: ID! }
      input ChannelStatementInput { channelId: ID!, from: String!, to: String! }
      type Query {
        redirectToInit: Boolean
        tourTotal: Int
        operatorName: String
        checkoutHold(holdId: ID!, token: String!): JSON
        waiverForToken(token: String!): JSON
        departuresInRange(from: String!, to: String!): JSON
        departureManifest(departureId: ID!): JSON
        toursOnSale: JSON
        tourAvailability(tourId: ID!, from: String!, to: String!): JSON
        lookupBooking(bookingRef: String!, email: String!): JSON
      }
      type Mutation {
        createDepartureHold(input: DepartureHoldInput!, idempotencyKey: String!): JSON
        startBookingCheckout(input: StartBookingCheckoutInput!, idempotencyKey: String!): JSON
        completeBookingCheckout(input: CompleteBookingCheckoutInput!, idempotencyKey: String!): JSON
        cancelMyBooking(bookingRef: String!, email: String!, idempotencyKey: String!): JSON
        signWaiver(input: SignWaiverInput!, idempotencyKey: String!): JSON
        rebookWithCredit(input: RebookInput!, idempotencyKey: String!): JSON
        generateDepartures(input: GenerateDeparturesInput, idempotencyKey: String!): JSON
        assignGuide(input: AssignGuideInput!, idempotencyKey: String!): JSON
        respondToAssignment(input: RespondAssignmentInput!, idempotencyKey: String!): JSON
        assignResource(input: AssignResourceInput!, idempotencyKey: String!): JSON
        resizeDeparture(input: ResizeDepartureInput!, idempotencyKey: String!): JSON
        checkInParticipant(input: ParticipantActionInput!, idempotencyKey: String!): JSON
        markNoShow(input: BookingActionInput!, idempotencyKey: String!): JSON
        cancelDeparture(input: CancelDepartureInput!, idempotencyKey: String!): JSON
        closeDeparture(input: CloseDepartureInput!, idempotencyKey: String!): JSON
        createChannelBooking(input: ChannelBookingInput!, idempotencyKey: String!): JSON
        refundBooking(input: RefundBookingInput!, idempotencyKey: String!): JSON
        requestRefundApproval(bookingId: ID!, reason: String!, amount: Int!): JSON
        approveRefund(approvalId: ID!): JSON
        generateChannelStatement(input: ChannelStatementInput!, idempotencyKey: String!): JSON
        sweepDepartures(idempotencyKey: String!): JSON
        ensureTourOnboardingRecord(entity: String!, data: JSON!): JSON
        seedTourActivity(template: String!, seed: JSON!): JSON
        updateActiveUser(data: UserUpdateProfileInput!): User
      }
    `,
    resolvers: {
      Query: { redirectToInit: redirectToInit_default, departuresInRange, departureManifest, waiverForToken, checkoutHold, operatorName: async (_r, _a, c) => c.session?.itemId ? (await c.sudo().query.StoreSettings.findMany({ take: 1, query: "name" }))[0]?.name || null : null, tourTotal: async (_r, _a, c) => c.session?.itemId ? c.sudo().query.Tour.count({}) : 0, toursOnSale, tourAvailability, lookupBooking },
      Mutation: {
        createDepartureHold,
        startBookingCheckout,
        completeBookingCheckout,
        cancelMyBooking,
        signWaiver,
        rebookWithCredit,
        generateDepartures,
        assignGuide,
        respondToAssignment,
        assignResource,
        resizeDeparture,
        checkInParticipant,
        markNoShow,
        cancelDeparture,
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
  const backgroundColor = "#f9f9f9";
  const textColor = "#444444";
  const mainBackgroundColor = "#ffffff";
  const buttonBackgroundColor = "#346df1";
  const buttonBorderColor = "#346df1";
  const buttonTextColor = "#ffffff";
  return `
    <body style="background: ${backgroundColor};">
      <table width="100%" border="0" cellspacing="20" cellpadding="0" style="background: ${mainBackgroundColor}; max-width: 600px; margin: auto; border-radius: 10px;">
        <tr>
          <td align="center" style="padding: 10px 0px 0px 0px; font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            Please click below to reset your password
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 20px 0;">
            <table border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" style="border-radius: 5px;" bgcolor="${buttonBackgroundColor}"><a href="${url}" target="_blank" style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${buttonTextColor}; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid ${buttonBorderColor}; display: inline-block; font-weight: bold;">Reset Password</a></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            If you did not request this email you can safely ignore it.
          </td>
        </tr>
      </table>
    </body>
  `;
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
      url: databaseURL,
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
