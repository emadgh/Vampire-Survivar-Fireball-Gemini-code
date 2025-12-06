
export const FLUID_CONFIG = {
  // Simulation Grid Resolution (Physics) - Lower = Faster
  SIM_RESOLUTION: 128, 
  // Dye/Visual Resolution - Higher = Crisper
  DYE_RESOLUTION: 512,
  
  // How fast velocity slows down (Higher = more drag/damping)
  // Old: 0.99 (~1% drag), New: 3.5 (High drag, fluid stops quickly)
  VELOCITY_DISSIPATION: 3.5, 
  
  // How fast smoke/fire fades away (Higher = fades faster)
  // Old: 0.985 (Long lasting), New: 2.5 (Fades 20-30% faster)
  DENSITY_DISSIPATION: 2.5,
  
  // Physics parameters
  PRESSURE: 0.8,
  CURL: 25, // Vorticity/Swirliness
  SPLAT_RADIUS: 0.005,
};
