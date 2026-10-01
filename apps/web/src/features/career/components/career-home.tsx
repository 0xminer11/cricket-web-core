'use client';

import { useEffect, useRef, useState } from 'react';
import { careerClient } from '../api/career-client';
import { useCareerData } from '../hooks/use-career-data';
import { useAuth } from '../../auth/hooks/use-auth';
import {
  ActionCards,
  CareerEventCard,
  CareerProgressCard,
  ContractCard,
  CurrencyRow,
  DegradedNotice,
  GuestBanner,
  IntroCard,
  NextMatchCard,
  ObjectivesPanel,
  PersonalityCard,
  PlayerHeader,
  RecentMatches,
  StatsSummary,
  UpcomingFixtures,
} from './home-cards';
import type { ReactNode } from 'react';
import {
  LoadError,
  PageSkeleton,
  RedirectToCreation,
  RequirePlayer,
} from './primitives';

/** Wrapper that fixes the mobile feed order (the desktop columns keep the same relative order). */
const Slot = ({ order, children }: { order: number; children: ReactNode }) => (
  <div className="career-slot" style={{ order }}>
    {children}
  </div>
);

function Content() {
  const auth = useAuth();
  const { state, retry } = useCareerData(() => careerClient.getHome());
  const [introDismissed, setIntroDismissed] = useState(false);
  const viewed = useRef(false);
  useEffect(() => {
    if (state.status === 'ready' && !viewed.current) {
      viewed.current = true;
      careerClient.track('career_home_viewed');
    }
  }, [state.status]);

  if (state.status === 'loading') return <PageSkeleton />;
  if (state.status === 'missing') return <RedirectToCreation />;
  if (state.status === 'error') return <LoadError onRetry={retry} />;
  const home = state.data;
  const showIntro = !home.onboarding.introCompleted && !introDismissed;
  return (
    <div className="stack career-page">
      {auth.user?.accountType === 'guest' ? <GuestBanner /> : null}
      <PlayerHeader home={home} />
      <DegradedNotice degraded={home.degraded} />
      <div className="career-grid">
        <div className="career-col">
          {showIntro ? (
            <Slot order={1}>
              <IntroCard
                onDone={() => {
                  setIntroDismissed(true);
                  void careerClient.completeIntro().catch(() => undefined);
                }}
              />
            </Slot>
          ) : null}
          <Slot order={2}>
            <NextMatchCard home={home} />
          </Slot>
          <Slot order={3}>
            <ActionCards home={home} />
          </Slot>
          <Slot order={6}>
            <CareerEventCard event={home.careerEvent} />
          </Slot>
          <Slot order={7}>
            <ObjectivesPanel
              objectives={home.objectives}
              achievements={home.achievements}
            />
          </Slot>
          <Slot order={9}>
            <StatsSummary stats={home.stats} />
          </Slot>
          <Slot order={10}>
            <RecentMatches matches={home.recentMatches} />
          </Slot>
        </div>
        <div className="career-col">
          <Slot order={4}>
            <CurrencyRow currencies={home.currencies} />
          </Slot>
          <Slot order={5}>
            <CareerProgressCard home={home} />
          </Slot>
          <Slot order={8}>
            <UpcomingFixtures fixtures={home.upcomingFixtures} />
          </Slot>
          <Slot order={11}>
            <ContractCard contract={home.contract} />
          </Slot>
          <Slot order={12}>
            <PersonalityCard personality={home.personality} />
          </Slot>
        </div>
      </div>
    </div>
  );
}

/** /career: the main game hub. One request (GET /career/home) renders the whole screen. */
export function CareerHome() {
  return (
    <RequirePlayer>
      <Content />
    </RequirePlayer>
  );
}
