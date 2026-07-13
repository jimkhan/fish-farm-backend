import { Module } from '@nestjs/common';
import { PortfolioSummaryUseCase } from './application/portfolio-summary.usecase';
import { PortfolioController } from './presentation/portfolio.controller';

/**
 * `GET /portfolio/summary` (CON-035, TASK-012). Kept separate from `ProjectsModule` on purpose:
 * `PortfolioSummaryUseCase` depends on `PROJECT_REPOSITORY` (ProjectsModule), `MEMBERSHIP_DIRECTORY`
 * (IdentityModule), `PORTFOLIO_BIOMASS` (PondsModule), and `PORTFOLIO_ALERTS` (NotificationsModule)
 * — all four are `@Global()` exports, so no explicit `imports:` is needed here. Bundling this into
 * `ProjectsModule` instead would force every test app / consumer that only needs plain project CRUD
 * to also satisfy Ponds+Notifications DI at boot, which is exactly the coupling this avoids.
 */
@Module({
  controllers: [PortfolioController],
  providers: [PortfolioSummaryUseCase],
})
export class PortfolioModule {}
