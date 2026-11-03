"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// keystone.ts
var keystone_exports = {};
__export(keystone_exports, {
  default: () => keystone_default2
});
module.exports = __toCommonJS(keystone_exports);

// features/keystone/index.ts
var import_auth = require("@keystone-6/auth");
var import_core17 = require("@keystone-6/core");
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
    context.prisma.booking.aggregate({ where: { departureId: item.id, status: { in: ["confirmed", "checked_in", "completed", "no_show", "partially_refunded"] } }, _sum: { seats: true } }),
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

// features/keystone/models/IdempotencyKey.ts
var import_core15 = require("@keystone-6/core");
var import_fields20 = require("@keystone-6/core/fields");
var IdempotencyKey = (0, import_core15.list)({
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
    idempotencyKey: (0, import_fields20.text)({
      isIndexed: "unique",
      validation: { isRequired: true }
    }),
    requestMethod: (0, import_fields20.text)({ validation: { isRequired: true } }),
    requestParams: (0, import_fields20.json)(),
    requestPath: (0, import_fields20.text)({ validation: { isRequired: true } }),
    responseCode: (0, import_fields20.integer)(),
    responseBody: (0, import_fields20.json)(),
    recoveryPoint: (0, import_fields20.text)({
      defaultValue: "started",
      validation: { isRequired: true }
    }),
    lockedAt: (0, import_fields20.timestamp)(),
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
  IdempotencyKey
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

// features/keystone/mutations/index.ts
var graphql2 = String.raw;
function extendGraphqlSchema(baseSchema) {
  return (0, import_schema.mergeSchemas)({
    schemas: [baseSchema],
    typeDefs: graphql2`
      type Query {
        redirectToInit: Boolean
      }
    `,
    resolvers: {
      Query: {
        redirectToInit: redirectToInit_default
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
  (0, import_core17.config)({
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
