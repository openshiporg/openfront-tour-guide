import { mergeSchemas } from "@graphql-tools/schema";
import type { GraphQLSchema } from 'graphql';
import redirectToInit from "./redirectToInit";
import { storeLogoTypeDefs, storeLogo } from "./storeLogo";
import { toursOnSale, tourAvailability, createDepartureHold, waiverForToken } from './tour-catalog';
import { startBookingCheckout, completeBookingCheckout, lookupBooking, bookingRefExists, cancelMyBooking, refundBooking, cancelDeparture, rebookWithCredit, createChannelBooking, operatorBookingByKey, signWaiver, sweepDepartures, checkoutHold, requestRefundApproval, approveRefund } from './tour-checkout';
import { generateDepartures, assignGuide, respondToAssignment, assignResource, unassignResource, resizeDeparture, checkInParticipant, markNoShow, undoNoShow, syncOfflineCheckIns, closeDeparture, generateChannelStatement } from './tour-operations';

import { ensureTourOnboardingRecord, seedTourActivity } from './tour-onboarding';
import { myDepartures, pickupSheet, dayPickupSheet } from './tour-guide-day';
import { salesReport, exportSalesCsv } from './tour-reports';
import { participantWaiver, captureWaiverOnSite } from './tour-waiver-capture';
import { manageBooking, cancelManagedBooking, rescheduleManagedBooking, resetGuestLink, moveBooking, bookingMoveOptions } from './tour-self-service';
import { weatherCancelDeparture, rebookWeatherBooking, weatherCancellations } from './tour-weather';
import { guestNotifications } from './tour-notification-queue';
import { partyChangeQuote, changeParty, completePartyChange, bookingParty, bookingPartyQuote, changeBookingParty } from './tour-party-change';
import { issueGiftCard, voidGiftCard, revealGiftCardCode, giftCardBoard, giftCardBalance } from './tour-gift-cards';
import { joinWaitlist, addToWaitlist, waitlistStatus, claimWaitlistOffer, leaveWaitlist, withdrawWaitlistEntry, bookWaitlistOffer, waitlistBoard } from './tour-waitlist';
import { departuresInRange, departureManifest } from './tour-manifest';
import updateActiveUser from './updateActiveUser';
import { transitionGuidePayout, transitionChannelStatement } from './tour-settlement';
import { pricingRuleBoard, savePricingRule, removePricingRule } from './tour-pricing-rules';

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
      Query: { pricingRuleBoard, storeLogo, giftCardBoard, giftCardBalance, partyChangeQuote, bookingParty, bookingPartyQuote, waitlistStatus, waitlistBoard, manageBooking, bookingMoveOptions, myDepartures, pickupSheet, dayPickupSheet, salesReport, operatorBookingByKey, guestNotifications, weatherCancellations, participantWaiver, redirectToInit, departuresInRange, departureManifest, waiverForToken, checkoutHold, bookingRefExists, operatorName: async (_r: any, _a: any, c: any) => (await c.sudo().query.StoreSettings.findMany({ take: 1, query: 'name' }))[0]?.name || null, tourTotal: async (_r: any, _a: any, c: any) => c.session?.itemId ? c.sudo().query.Tour.count({}) : 0, toursOnSale, tourAvailability, lookupBooking },
      Mutation: {
        createDepartureHold, startBookingCheckout, completeBookingCheckout, cancelMyBooking, cancelManagedBooking, rescheduleManagedBooking, signWaiver, rebookWithCredit,
        generateDepartures, assignGuide, respondToAssignment, assignResource, unassignResource, resizeDeparture, checkInParticipant, markNoShow, undoNoShow, syncOfflineCheckIns, resetGuestLink, moveBooking,
        transitionGuidePayout, transitionChannelStatement, savePricingRule, removePricingRule,
        changeParty, completePartyChange, changeBookingParty,
        issueGiftCard, voidGiftCard, revealGiftCardCode,
        joinWaitlist, addToWaitlist, claimWaitlistOffer, leaveWaitlist, withdrawWaitlistEntry, bookWaitlistOffer,
        cancelDeparture, captureWaiverOnSite, exportSalesCsv, weatherCancelDeparture, rebookWeatherBooking, closeDeparture, createChannelBooking, refundBooking, requestRefundApproval, approveRefund, generateChannelStatement, sweepDepartures, ensureTourOnboardingRecord, seedTourActivity, updateActiveUser,
      },
    },
  });
}
