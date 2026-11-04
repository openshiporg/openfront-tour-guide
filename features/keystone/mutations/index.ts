import { mergeSchemas } from "@graphql-tools/schema";
import type { GraphQLSchema } from 'graphql';
import redirectToInit from "./redirectToInit";
import { toursOnSale, tourAvailability, createDepartureHold, waiverForToken } from './tour-catalog';
import { startBookingCheckout, completeBookingCheckout, lookupBooking, cancelMyBooking, refundBooking, cancelDeparture, rebookWithCredit, createChannelBooking, signWaiver, sweepDepartures, checkoutHold, requestRefundApproval, approveRefund } from './tour-checkout';
import { generateDepartures, assignGuide, respondToAssignment, assignResource, resizeDeparture, checkInParticipant, markNoShow, closeDeparture, generateChannelStatement } from './tour-operations';

import { ensureTourOnboardingRecord, seedTourActivity } from './tour-onboarding';
import { departuresInRange, departureManifest } from './tour-manifest';
import updateActiveUser from './updateActiveUser';
import { transitionGuidePayout, transitionChannelStatement } from './tour-settlement';

const graphql = String.raw;


export function extendGraphqlSchema(baseSchema: GraphQLSchema) {
  return mergeSchemas({
    schemas: [baseSchema],
    typeDefs: graphql`
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
      input SettlementTransitionInput { id: ID!, status: String!, reference: String }
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
        transitionGuidePayout(input: SettlementTransitionInput!, idempotencyKey: String!): JSON
        transitionChannelStatement(input: SettlementTransitionInput!, idempotencyKey: String!): JSON
        sweepDepartures(idempotencyKey: String!): JSON
        ensureTourOnboardingRecord(entity: String!, data: JSON!): JSON
        seedTourActivity(template: String!, seed: JSON!): JSON
        updateActiveUser(data: UserUpdateProfileInput!): User
      }
    `,
    resolvers: {
      Query: { redirectToInit, departuresInRange, departureManifest, waiverForToken, checkoutHold, operatorName: async (_r: any, _a: any, c: any) => (await c.sudo().query.StoreSettings.findMany({ take: 1, query: 'name' }))[0]?.name || null, tourTotal: async (_r: any, _a: any, c: any) => c.session?.itemId ? c.sudo().query.Tour.count({}) : 0, toursOnSale, tourAvailability, lookupBooking },
      Mutation: {
        createDepartureHold, startBookingCheckout, completeBookingCheckout, cancelMyBooking, signWaiver, rebookWithCredit,
        generateDepartures, assignGuide, respondToAssignment, assignResource, resizeDeparture, checkInParticipant, markNoShow,
        transitionGuidePayout, transitionChannelStatement,
        cancelDeparture, closeDeparture, createChannelBooking, refundBooking, requestRefundApproval, approveRefund, generateChannelStatement, sweepDepartures, ensureTourOnboardingRecord, seedTourActivity, updateActiveUser,
      },
    },
  });
}
