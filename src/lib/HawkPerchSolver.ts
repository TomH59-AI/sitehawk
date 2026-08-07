/**
 * TalonFit® / HawkPerch solver — frontend entry point.
 *
 * The implementation lives in base44/shared/hawkPerchSolver.ts so that backend
 * functions (and therefore the TalonFit agent) run the EXACT same code as the
 * cursor probe and the map. Two copies of siting math would drift, and the day
 * they disagree is the day a client is told two different maximum heights for
 * the same parcel.
 */
export * from '../../base44/shared/hawkPerchSolver';
