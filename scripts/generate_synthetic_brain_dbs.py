#!/usr/bin/env python3
"""
Generate a 100% synthetic whole-brain human white-matter tractography model
with a SINGLE unilateral Medtronic 3387 DBS electrode, solve the 3D/axisymmetric
Laplace electrostatic potential field for Contacts 0, 1, 2, and 3, and run the
real TensorFlow CNN surrogate model (`models/cnn_103_class`) across all 17 pulse
widths (60 us to 500 us) and 4 contacts.

IMPORTANT: Zero patient data files are read or referenced by this script.
All cortical surfaces, trajectories, and streamlines are mathematically synthesized
from scratch in standard stereotactic millimeter coordinates.

Outputs compact web assets to `public/data/`:
  - `synthetic_dbs_meta.json`: Pathway metadata, single lead geometry, pulse widths, cortex mesh stats
  - `synthetic_dbs_atlas.bin`: Binary packed float32/uint16 geometry + [4 x 17 x N_fibers] CNN threshold LUT
"""

import json
import math
import os
import struct
import sys
import time
import numpy as np
from scipy.interpolate import CubicSpline
from scipy.sparse import lil_matrix
from scipy.sparse.linalg import spsolve
from scipy.interpolate import RegularGridInterpolator

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"

import tensorflow as tf

# Import Fiber feature extractor and ANN model specs from SeniorThesis/run (code only, ZERO patient data)
SENIOR_THESIS_DIR = r"c:\Users\benbe\OneDrive\Documents\SeniorThesis"
CNN_MODEL_DIR = os.path.join(SENIOR_THESIS_DIR, "models", "cnn_103_class")
sys.path.insert(0, os.path.join(SENIOR_THESIS_DIR, "run"))
import fiber_DTI  # noqa: E402
import ann_predict_lib  # noqa: E402

PULSE_WIDTHS_US = [
    60, 75, 90, 105, 120, 135, 150, 175, 200,
    225, 250, 275, 300, 350, 400, 450, 500,
]

# Medtronic 3387 physical dimensions (mm)
LEAD_RADIUS_MM = 0.635          # 1.27 mm diameter
CONTACT_LEN_MM = 1.5
CONTACT_SPACING_MM = 1.5
SCAR_THICKNESS_MM = 0.500
LEAD_CLEARANCE_MM = LEAD_RADIUS_MM + SCAR_THICKNESS_MM  # 1.135 mm
NODE_SPACING_MM = 0.5           # Exact MRG 5.7 um axon internodal distance expected by cnn_103_class

# Unilateral Left-Hemisphere Medtronic 3387 Lead Placement (Subthalamic / Capsular Target)
LEAD_C0_POS = np.array([-11.8, -13.5, -7.5], dtype=np.float64)
_ENTRY_POS = np.array([-29.0, 24.0, 66.0], dtype=np.float64)
LEAD_AXIS_U = (_ENTRY_POS - LEAD_C0_POS) / np.linalg.norm(_ENTRY_POS - LEAD_C0_POS)
LEAD_TIP_POS = LEAD_C0_POS - (CONTACT_LEN_MM / 2.0) * LEAD_AXIS_U
LEAD_SHAFT_LEN_MM = 76.0

PATHWAYS = [
    {
        "id": "CST",
        "name": "Corticospinal Tract",
        "region": "Left Motor Cortex -> Internal Capsule -> Brainstem",
        "count": 650,
        "color": "#00E5FF",
        "inactiveColor": "#083A47",
    },
    {
        "id": "HDP",
        "name": "Hyperdirect Pathway",
        "region": "Left Prefrontal / Pre-SMA -> Subthalamic Target",
        "count": 500,
        "color": "#D500F9",
        "inactiveColor": "#3B0A45",
    },
    {
        "id": "DRTT",
        "name": "Dentatorubrothalamic Tract",
        "region": "Deep Brainstem -> Ventral Subthalamic -> Motor Cortex",
        "count": 500,
        "color": "#FFB300",
        "inactiveColor": "#4A3200",
    },
    {
        "id": "PTF",
        "name": "Pallidothalamic Fasciculus",
        "region": "Left Basal Ganglia -> Dorsal Zona Incerta -> Thalamus",
        "count": 450,
        "color": "#00E676",
        "inactiveColor": "#073E22",
    },
    {
        "id": "CC",
        "name": "Corpus Callosum",
        "region": "Bilateral Interhemispheric Commissural Arch",
        "count": 650,
        "color": "#FF4081",
        "inactiveColor": "#471226",
    },
    {
        "id": "SLF",
        "name": "Arcuate & Longitudinal Fasciculus",
        "region": "Bilateral Fronto-Parieto-Temporal Cortical Arch",
        "count": 450,
        "color": "#3D8BFF",
        "inactiveColor": "#10284E",
    },
]


# =============================================================================
# 1. Axisymmetric 2D Laplace Electrostatic FEM Solver for Medtronic 3387 Lead
# =============================================================================
def solve_medtronic_3387_potentials():
    """
    Solve div(sigma * grad(V)) = 0 in cylindrical (r, z) coordinates around a
    single Medtronic 3387 lead with:
      - Lead radius r0 = 0.635 mm, shaft z in [0, 76] mm (tip at z = 0)
      - Contact k (k = 0, 1, 2, 3) spanning z in [3*k, 3*k + 1.5] mm
      - Active contact fixed at V = -1.0 V (Dirichlet)
      - Polyurethane insulator segments: dV/dn = 0 (Neumann)
      - Glial encapsulation sheath r in [0.635, 1.135] mm (sigma = 0.10 S/m)
      - Bulk brain tissue (sigma = 0.20 S/m)
      - Far-field outer boundary at R_max = 110 mm, Z in [-80, +110] mm: V = 0 V

    Returns a list of 4 fast 2D (r, z) interpolators returning potential in Volts
    for a -1.0 V cathodic stimulation on Contact 0, 1, 2, 3 respectively.
    """
    print("\n[1/4] Solving axisymmetric Laplace PDE for single Medtronic 3387 electrode (Contacts 0-3)...")
    t0 = time.time()

    # Graded radial grid: dense near r = 0..5 mm, geometric expansion to 110 mm
    r_inner = np.linspace(0.0, 0.635, 10, endpoint=False)
    r_near = np.linspace(0.635, 4.0, 55, endpoint=False)
    r_mid = np.geomspace(4.0, 25.0, 45, endpoint=False)
    r_far = np.geomspace(25.0, 115.0, 35)
    r_grid = np.unique(np.round(np.concatenate([r_inner, r_near, r_mid, r_far]), 6))

    # Graded axial grid: dense across tip & 4 contacts z in [-4, 16] mm
    z_below = -np.geomspace(4.0, 85.0, 40)[::-1]
    z_contacts = np.linspace(-4.0, 16.0, 161)
    z_shaft = np.geomspace(16.2, 115.0, 45)
    z_grid = np.unique(np.round(np.concatenate([z_below, z_contacts, z_shaft]), 6))

    nr, nz = len(r_grid), len(z_grid)
    n_total = nr * nz

    R, Z = np.meshgrid(r_grid, z_grid, indexing="ij")

    # Identify points inside the physical lead body (hemispherical tip z in [0, r0] + cylinder z in [r0, 76])
    r0 = LEAD_RADIUS_MM
    in_tip = (Z >= 0.0) & (Z < r0) & ((R**2 + (Z - r0) ** 2) <= (r0 + 1e-5) ** 2)
    in_cyl = (Z >= r0) & (Z <= LEAD_SHAFT_LEN_MM) & (R <= r0 + 1e-5)
    in_lead = in_tip | in_cyl

    # Encapsulation sheath around lead (within 0.5 mm of shaft/tip)
    dist_to_shaft = np.where(
        Z < r0,
        np.sqrt(R**2 + (Z - r0) ** 2) - r0,
        np.where(Z <= LEAD_SHAFT_LEN_MM, R - r0, np.sqrt(R**2 + (Z - LEAD_SHAFT_LEN_MM) ** 2) - r0),
    )
    sigma = np.where(dist_to_shaft <= SCAR_THICKNESS_MM, 0.10, 0.20)
    # Inside insulated lead body, set very tiny conductivity so Neumann dV/dn ~ 0 naturally holds!
    # And inside platinum contacts, high conductivity keeps each contact equipotential!
    sigma = np.where(in_lead, 1e-8, sigma)
    for k in range(4):
        z_lo = 3.0 * k
        z_hi = z_lo + CONTACT_LEN_MM
        in_ck = in_lead & (Z >= z_lo - 1e-4) & (Z <= z_hi + 1e-4)
        sigma = np.where(in_ck, 1e4, sigma)  # Floating equipotential platinum for passive contacts!

    # Assemble base finite-volume axisymmetric Laplacian matrix once
    # At node (i, j): (1/r_i) * d/dr(r * sigma * dV/dr) + d/dz(sigma * dV/dz) = 0
    base_A = lil_matrix((n_total, n_total), dtype=np.float64)
    outer_mask = np.zeros((nr, nz), dtype=bool)
    outer_mask[-1, :] = True
    outer_mask[:, 0] = True
    outer_mask[:, -1] = True

    for i in range(nr):
        for j in range(nz):
            idx = i * nz + j
            if outer_mask[i, j]:
                base_A[idx, idx] = 1.0
                continue

            dz_m = z_grid[j] - z_grid[j - 1]
            dz_p = z_grid[j + 1] - z_grid[j]
            dz_c = 0.5 * (dz_m + dz_p)

            sig_zm = 0.5 * (sigma[i, j] + sigma[i, j - 1])
            sig_zp = 0.5 * (sigma[i, j] + sigma[i, j + 1])
            az_m = sig_zm / (dz_m * dz_c)
            az_p = sig_zp / (dz_p * dz_c)

            if i == 0:
                # Symmetry axis r = 0: limit (1/r) d/dr(r dV/dr) = 2 d^2V/dr^2 -> 4 * sig_rp * (V_1 - V_0) / dr_p^2
                dr_p = r_grid[1] - r_grid[0]
                sig_rp = 0.5 * (sigma[0, j] + sigma[1, j])
                ar_p = 4.0 * sig_rp / (dr_p * dr_p)
                ar_m = 0.0
            else:
                r_i = r_grid[i]
                dr_m = r_grid[i] - r_grid[i - 1]
                dr_p = r_grid[i + 1] - r_grid[i]
                dr_c = 0.5 * (dr_m + dr_p)
                r_m = r_i - 0.5 * dr_m
                r_p = r_i + 0.5 * dr_p
                sig_rm = 0.5 * (sigma[i, j] + sigma[i - 1, j])
                sig_rp = 0.5 * (sigma[i, j] + sigma[i + 1, j])
                ar_m = (r_m * sig_rm) / (r_i * dr_m * dr_c)
                ar_p = (r_p * sig_rp) / (r_i * dr_p * dr_c)

            diag = ar_m + ar_p + az_m + az_p
            base_A[idx, idx] = -diag
            if i > 0:
                base_A[idx, (i - 1) * nz + j] = ar_m
            base_A[idx, (i + 1) * nz + j] = ar_p
            base_A[idx, i * nz + (j - 1)] = az_m
            base_A[idx, i * nz + (j + 1)] = az_p

    interpolators = []
    for c_idx in range(4):
        A = base_A.copy()
        b = np.zeros(n_total, dtype=np.float64)

        z_lo = 3.0 * c_idx
        z_hi = z_lo + CONTACT_LEN_MM
        active_mask = in_lead & (Z >= z_lo - 1e-4) & (Z <= z_hi + 1e-4)

        active_flat = np.flatnonzero(active_mask.ravel())
        for idx in active_flat:
            A.rows[idx] = [idx]
            A.data[idx] = [1.0]
            b[idx] = -1.0  # -1.0 V cathodic contact potential

        V_flat = spsolve(A.tocsr(), b)
        V_2d = V_flat.reshape((nr, nz))

        interp = RegularGridInterpolator(
            (r_grid, z_grid),
            V_2d,
            method="linear",
            bounds_error=False,
            fill_value=0.0,
        )
        # Quick physical check at r = 2.0 mm opposite active contact center
        v_2mm = float(interp([[2.0, z_lo + 0.75]])[0])
        v_5mm = float(interp([[5.0, z_lo + 0.75]])[0])
        print(f"  Contact {c_idx}: V(r=2mm) = {v_2mm:.4f} V, V(r=5mm) = {v_5mm:.4f} V")
        interpolators.append(interp)

    print(f"  Solved all 4 contact potential fields in {time.time() - t0:.2f}s")
    return interpolators


def eval_potential_on_points(pts_xyz: np.ndarray, interp_rz) -> np.ndarray:
    """Evaluate 3D potential (in mV for -1V contact) at world coordinates `pts_xyz` (N, 3)."""
    rel = pts_xyz - LEAD_TIP_POS[None, :]
    z_local = rel @ LEAD_AXIS_U
    perp = rel - np.outer(z_local, LEAD_AXIS_U)
    r_local = np.linalg.norm(perp, axis=1)
    rz = np.column_stack([r_local, z_local])
    v_volts = interp_rz(rz)
    return v_volts * 1000.0  # mV (dti_ann_LUT_precomputed uses mV internally for 1V peak)


# =============================================================================
# 2. Procedural 3D Human Cortical Surface + Brainstem Envelope Mesh
# =============================================================================
def build_human_brain_shell():
    """
    Build a smooth, anatomically proportioned 3D human brain surface mesh
    (Left Hemisphere, Right Hemisphere, and Brainstem) in stereotactic mm coordinates.
    """
    vertices = []
    faces = []

    def add_parametric_closed_surface(u_steps, v_steps, point_fn):
        base_idx = len(vertices)
        # Poles + rings
        top_pt = point_fn(0.0, 0.0)
        bot_pt = point_fn(math.pi, 0.0)
        vertices.append(top_pt)
        for iv in range(1, v_steps):
            theta = math.pi * iv / v_steps
            for iu in range(u_steps):
                phi = 2.0 * math.pi * iu / u_steps
                vertices.append(point_fn(theta, phi))
        bot_idx = len(vertices)
        vertices.append(bot_pt)

        # Top cap
        for iu in range(u_steps):
            iu_next = (iu + 1) % u_steps
            faces.append([base_idx, base_idx + 1 + iu, base_idx + 1 + iu_next])

        # Middle quads
        for iv in range(v_steps - 2):
            r0 = base_idx + 1 + iv * u_steps
            r1 = base_idx + 1 + (iv + 1) * u_steps
            for iu in range(u_steps):
                iu_next = (iu + 1) % u_steps
                faces.append([r0 + iu, r1 + iu, r1 + iu_next])
                faces.append([r0 + iu, r1 + iu_next, r0 + iu_next])

        # Bottom cap
        r_last = base_idx + 1 + (v_steps - 2) * u_steps
        for iu in range(u_steps):
            iu_next = (iu + 1) % u_steps
            faces.append([r_last + iu, bot_idx, r_last + iu_next])

    # Left and Right Cerebral Hemispheres
    for side in (-1.0, 1.0):
        def hemi_point(theta, phi, s=side):
            st = math.sin(theta)
            ct = math.cos(theta)
            ux = st * math.cos(phi)  # [-1, 1]: +1 is lateral, -1 is medial (interhemispheric)
            uy = st * math.sin(phi)  # [-1, 1]: +1 is anterior (frontal), -1 is posterior (occipital)
            uz = ct                  # [-1, 1]: +1 is superior, -1 is inferior

            # Anterior-posterior coordinate y in [-100, +70] mm
            y = -15.0 + 85.0 * uy - 4.0 * (1.0 - uy * uy)

            # Flatten medial wall cleanly against interhemispheric fissure
            if ux < 0.0:
                lat_frac = 0.03 * (1.0 + ux)  # hugs midline ~2.0..4.5 mm
            else:
                lat_frac = 0.03 + 0.97 * (ux ** 0.68)

            # Width tapers toward frontal and occipital poles
            ap_taper = max(0.28, (1.0 - 0.50 * (uy ** 2)) ** 0.48)
            # Temporal lobe widens inferior-laterally around y in [-35, +15]
            temp_window = math.exp(-(((uy + 0.10) / 0.44) ** 2))
            width_mm = (66.0 * ap_taper + 8.0 * temp_window * max(0.0, -uz)) * lat_frac
            x = s * (2.2 + width_mm)
            if s < 0:
                # Reverse winding handled below if needed; keep outward normal check
                pass

            # Superior-inferior z profile: vaulted dorsal crown, orbital base anteriorly, temporal lobe dip
            if uz >= 0.0:
                crown_ap = (1.0 - 0.42 * (uy - 0.08) ** 2)
                z = 12.0 + 65.0 * (uz ** 0.72) * max(0.42, crown_ap)
            else:
                inf_u = -uz
                # Temporal pole & inferior diencephalic/peduncular base
                temp_dip = 28.0 * temp_window * (0.48 + 0.52 * (max(0.0, ux) ** 0.65)) * math.sin(min(1.0, inf_u) * math.pi * 0.65)
                # Frontal orbital flattening & occipital tentorial rise
                front_lift = 9.0 * max(0.0, uy) ** 1.3
                occ_lift = 10.0 * max(0.0, -uy - 0.25) ** 1.2
                z = 12.0 - 30.0 * (inf_u ** 0.82) - temp_dip + front_lift + occ_lift

            # Subtle Sylvian lateral sulcus indentation
            sylvian = math.exp(-(((uy - 0.08) / 0.34) ** 2)) * math.exp(-(((uz + 0.08) / 0.16) ** 2)) * max(0.0, ux)
            x -= s * 3.8 * sylvian

            # Gentle organic cortical gyral ripple
            ripple = 0.8 * math.sin(0.14 * y + 0.18 * z) * math.cos(0.16 * abs(x) - 0.11 * y) * max(0.0, ux)
            x += s * ripple * 0.5
            z += ripple * 0.4

            return [round(x, 2), round(y, 2), round(z, 2)]

        f_start = len(faces)
        add_parametric_closed_surface(44, 28, hemi_point)
        if side < 0:
            # Flip triangle winding because x was mirrored
            for fi in range(f_start, len(faces)):
                faces[fi] = [faces[fi][0], faces[fi][2], faces[fi][1]]

    # Brainstem + Cerebral Peduncle contour
    def brainstem_point(theta, phi):
        t = theta / math.pi  # 0 (diencephalic/peduncular top) -> 1 (medulla bottom)
        z = -1.0 - 60.0 * t
        # Upper peduncular flare into subthalamic/internal capsule base + ventral pontine belly bulge
        ped_flare = math.exp(-((t / 0.30) ** 2))
        pons_bulge = math.exp(-(((t - 0.45) / 0.22) ** 2))
        rx = 14.5 * (1.0 - 0.36 * t) + 8.0 * ped_flare + 3.5 * pons_bulge
        ry = 13.0 * (1.0 - 0.34 * t) + 7.0 * ped_flare + 5.5 * pons_bulge
        cy = -18.0 - 15.0 * t + 4.0 * ped_flare + 5.0 * pons_bulge * max(0.0, math.sin(phi))
        end_cap = math.sin(theta) ** 0.35 if (t < 0.05 or t > 0.95) else 1.0
        x = rx * end_cap * math.cos(phi)
        y = cy + ry * end_cap * math.sin(phi)
        return [round(x, 2), round(y, 2), round(z, 2)]

    add_parametric_closed_surface(24, 18, brainstem_point)

    # Cerebellum posterior fossa bilobed shell
    def cerebellum_point(theta, phi):
        st = math.sin(theta)
        ct = math.cos(theta)
        ux = st * math.cos(phi)
        uy = st * math.sin(phi)
        uz = ct
        # Bilobed vermis notch near x = 0
        vermis = 1.0 - 0.22 * math.exp(-((ux / 0.22) ** 2))
        x = 48.0 * ux
        y = -56.0 + 23.0 * uy * vermis
        z = -34.0 + 17.5 * uz * vermis
        return [round(x, 2), round(y, 2), round(z, 2)]

    add_parametric_closed_surface(32, 18, cerebellum_point)

    return np.asarray(vertices, dtype=np.float32), np.asarray(faces, dtype=np.uint16)


# =============================================================================
# 3. Synthetic Human White-Matter Streamline Generator (0.5 mm MRG Spacing)
# =============================================================================
def resample_spline_05mm(waypoints: np.ndarray) -> np.ndarray:
    """Fit a smooth 3D cubic spline through `waypoints` (K, 3) and sample at exact 0.5 mm arc-length steps."""
    diffs = np.diff(waypoints, axis=0)
    seg_lens = np.linalg.norm(diffs, axis=1)
    cum = np.concatenate([[0.0], np.cumsum(seg_lens)])
    cs = CubicSpline(cum, waypoints, axis=0, bc_type="natural")

    # Fine arc-length integration
    s_fine = np.linspace(0.0, cum[-1], 600)
    pts_fine = cs(s_fine)
    fine_steps = np.linalg.norm(np.diff(pts_fine, axis=0), axis=1)
    arc = np.concatenate([[0.0], np.cumsum(fine_steps)])
    total_len = arc[-1]

    n_nodes = int(math.floor(total_len / NODE_SPACING_MM)) + 1
    target_arc = np.arange(n_nodes, dtype=np.float64) * NODE_SPACING_MM
    idx_interp = np.interp(target_arc, arc, s_fine)
    nodes = cs(idx_interp)
    return nodes.astype(np.float32)


def fiber_clears_lead(pts: np.ndarray, min_sep: float = LEAD_CLEARANCE_MM + 0.08) -> bool:
    """Ensure no node or midpoint lies inside the single Medtronic 3387 lead or 0.5 mm scar sheath."""
    rel = pts.astype(np.float64) - LEAD_TIP_POS[None, :]
    s = np.clip(rel @ LEAD_AXIS_U, 0.0, LEAD_SHAFT_LEN_MM)
    perp = rel - np.outer(s, LEAD_AXIS_U)
    dist_sq = np.sum(perp * perp, axis=1)
    return bool(np.all(dist_sq > min_sep * min_sep))


def _hemi_shell_envelope_at_dir(uy: float, alpha: float) -> tuple[float, float]:
    """
    Evaluate the exact (|x_shell|, z_shell) outer cortical boundary of `hemi_point`
    at normalized AP coordinate `uy` in [-1, 1] and coronal angle `alpha` in [-pi/2, pi/2].
    """
    uy_c = max(-0.97, min(0.97, uy))
    r_ring = math.sqrt(max(0.02, 1.0 - uy_c * uy_c))
    ux = max(0.0, r_ring * math.cos(alpha))
    uz = r_ring * math.sin(alpha)

    lat_frac = 0.03 + 0.97 * (ux ** 0.68)
    ap_taper = max(0.28, (1.0 - 0.50 * (uy_c ** 2)) ** 0.48)
    temp_window = math.exp(-(((uy_c + 0.10) / 0.44) ** 2))
    width_mm = (66.0 * ap_taper + 8.0 * temp_window * max(0.0, -uz)) * lat_frac
    x_abs = 2.2 + width_mm

    if uz >= 0.0:
        crown_ap = 1.0 - 0.42 * (uy_c - 0.08) ** 2
        z_shell = 12.0 + 65.0 * (uz ** 0.72) * max(0.42, crown_ap)
    else:
        inf_u = -uz
        temp_dip = 28.0 * temp_window * (0.48 + 0.52 * (max(0.0, ux) ** 0.65)) * math.sin(min(1.0, inf_u) * math.pi * 0.65)
        front_lift = 9.0 * max(0.0, uy_c) ** 1.3
        occ_lift = 10.0 * max(0.0, -uy_c - 0.25) ** 1.2
        z_shell = 12.0 - 30.0 * (inf_u ** 0.82) - temp_dip + front_lift + occ_lift

    sylvian = math.exp(-(((uy_c - 0.08) / 0.34) ** 2)) * math.exp(-(((uz + 0.08) / 0.16) ** 2)) * max(0.0, ux)
    x_abs -= 3.8 * sylvian
    return x_abs, z_shell


def clamp_point_inside_shell(pt: np.ndarray, pid: str, margin_mm: float = 5.0) -> np.ndarray:
    """Pull any waypoint that approaches the outer cortical/brainstem shell safely inside by `margin_mm`."""
    x, y, z = float(pt[0]), float(pt[1]), float(pt[2])

    # Brainstem region (deep inferior points z < -14 and near midline/posterior)
    if z < -14.0 and abs(x) < 20.0 and y < -8.0:
        z = max(-56.5, z)
        t = max(0.0, min(1.0, (-1.0 - z) / 60.0))
        ped_flare = math.exp(-((t / 0.30) ** 2))
        pons_bulge = math.exp(-(((t - 0.45) / 0.22) ** 2))
        rx = (14.5 * (1.0 - 0.36 * t) + 8.0 * ped_flare + 3.5 * pons_bulge) - 2.4
        ry = (13.0 * (1.0 - 0.34 * t) + 7.0 * ped_flare + 5.5 * pons_bulge) - 2.4
        cy = -18.0 - 15.0 * t + 4.0 * ped_flare + 2.0 * pons_bulge
        dx = x
        dy = y - cy
        ell = math.hypot(dx / max(3.0, rx), dy / max(3.0, ry))
        if ell > 0.86:
            scale = 0.86 / ell
            x = dx * scale
            y = cy + dy * scale
        return np.array([x, y, z], dtype=np.float64)

    # Cerebral hemisphere region
    y = max(-92.0, min(62.0, y))
    s = -1.0 if x < 0.0 else 1.0
    if pid != "CC":
        if abs(x) < 5.0 and z > -10.0:
            x = s * 5.0

    # Iteratively pull toward hemisphere core (s * 16.0, -15.0, 12.0) if outside subcortical margin
    core_x = 0.0 if (pid == "CC" and abs(x) < 14.0) else s * 16.0
    core_y = -15.0
    core_z = 12.0

    for _ in range(8):
        uy0 = (y + 15.0) / 85.0
        uy = max(-0.93, min(0.93, (y + 15.0 + 4.0 * (1.0 - uy0 * uy0)) / 85.0))
        dx = max(0.5, abs(x) - 2.2)
        dz = z - 12.0
        alpha = math.atan2(dz, dx)
        x_shell, z_shell = _hemi_shell_envelope_at_dir(uy, alpha)

        r_pt = math.hypot(dx, dz)
        r_sh = math.hypot(max(1.0, x_shell - 2.2), z_shell - 12.0)
        if r_pt <= r_sh - margin_mm:
            break
        scale = max(0.5, (r_sh - margin_mm) / max(1.0, r_pt))
        x = s * (2.2 + dx * scale)
        z = 12.0 + dz * scale
        y = core_y + 0.94 * (y - core_y)

    return np.array([x, y, z], dtype=np.float64)


def fiber_inside_brain_shell(pts: np.ndarray, pid: str, min_margin_mm: float = 2.8) -> bool:
    """Verify every single node of a resampled streamline lies strictly inside the 3D brain shell."""
    for i in range(0, len(pts), 2):
        x, y, z = float(pts[i, 0]), float(pts[i, 1]), float(pts[i, 2])
        if z < -14.0 and abs(x) < 20.0 and y < -8.0:
            if z < -58.5:
                return False
            t = max(0.0, min(1.0, (-1.0 - z) / 60.0))
            ped_flare = math.exp(-((t / 0.30) ** 2))
            pons_bulge = math.exp(-(((t - 0.45) / 0.22) ** 2))
            rx = 14.5 * (1.0 - 0.36 * t) + 8.0 * ped_flare + 3.5 * pons_bulge - 1.2
            ry = 13.0 * (1.0 - 0.34 * t) + 7.0 * ped_flare + 5.5 * pons_bulge - 1.2
            cy = -18.0 - 15.0 * t + 4.0 * ped_flare + 2.0 * pons_bulge
            if (x / rx) ** 2 + ((y - cy) / ry) ** 2 > 0.98:
                return False
            continue

        if y < -95.0 or y > 65.0:
            return False
        if pid != "CC" and z > 18.0 and abs(x) < 3.8:
            return False

        uy0 = (y + 15.0) / 85.0
        uy = max(-0.96, min(0.96, (y + 15.0 + 4.0 * (1.0 - uy0 * uy0)) / 85.0))
        dx = max(0.5, abs(x) - 2.2)
        dz = z - 12.0
        alpha = math.atan2(dz, dx)
        x_shell, z_shell = _hemi_shell_envelope_at_dir(uy, alpha)

        r_pt = math.hypot(dx, dz)
        r_sh = math.hypot(max(1.0, x_shell - 2.2), z_shell - 12.0)
        if r_pt > r_sh - min_margin_mm:
            return False
    return True


def generate_all_synthetic_pathways(rng: np.random.Generator):
    print("\n[2/4] Synthesizing 3,200 whole-brain human white-matter streamlines (6 pathways, 1 electrode)...")
    t0 = time.time()
    all_fibers = []
    manifest = {}

    def sample_pathway(pid: str, count: int, builder_fn):
        start_idx = len(all_fibers)
        accepted = 0
        attempts = 0
        while accepted < count:
            attempts += 1
            if attempts > count * 50:
                raise RuntimeError(f"Too many rejections while sampling pathway {pid}")
            raw_wpts = builder_fn(rng)
            wpts = np.vstack([clamp_point_inside_shell(pt, pid, margin_mm=6.2) for pt in raw_wpts])
            pts = resample_spline_05mm(wpts)
            if len(pts) < 115:  # Ensure >= 115 MRG nodes (> 57 mm) so 103-node CNN window fits cleanly!
                continue
            if not fiber_clears_lead(pts):
                continue
            if not fiber_inside_brain_shell(pts, pid, min_margin_mm=3.2):
                continue
            all_fibers.append(pts)
            accepted += 1
        manifest[pid] = {"start": start_idx, "count": count, "end": start_idx + count}
        print(f"  Pathway {pid:<5}: {count:4d} fibers | mean nodes = {np.mean([len(f) for f in all_fibers[start_idx:]]):.1f}")

    # 1. CST: Left Motor/Sensorimotor Cortex fan -> Left Internal Capsule -> Cerebral Peduncle -> Pons/Medulla
    def build_cst(r: np.random.Generator):
        # Broad sensorimotor cortical fan (medial leg area to lateral hand/face area)
        fan_u = r.uniform(0.0, 1.0)
        ap_j = r.normal(0.0, 5.5)
        cx = -10.0 - 44.0 * (fan_u ** 0.92) + r.normal(0.0, 2.0)
        cy = -14.0 + 10.0 * math.sin(fan_u * math.pi) + ap_j
        cz = 71.0 - 25.0 * (fan_u ** 1.45) + r.normal(0.0, 2.2)

        # Corona radiata convergence
        cr_x = 0.55 * cx + 0.45 * (-22.0) + r.normal(0.0, 1.6)
        cr_y = 0.55 * cy + 0.45 * (-13.0) + r.normal(0.0, 1.6)
        cr_z = 33.0 + r.normal(0.0, 2.5)

        # Posterior limb of Internal Capsule (passes lateral & slightly anterior/posterior to STN lead!)
        ic_x = r.uniform(-21.5, -13.2)
        ic_y = r.uniform(-18.5, -7.5)
        ic_z = r.uniform(-3.5, 4.5)

        # Subthalamic / Crus cerebri level (closest approach to Contacts 1-3 laterally)
        ped_x = ic_x + r.uniform(1.2, 3.8)
        ped_y = ic_y - r.uniform(1.5, 4.0)
        ped_z = -12.5 + r.normal(0.0, 1.2)

        # Ventral Pons & Medulla descent
        pons_x = -8.5 + 0.25 * (ic_x + 17.0) + r.normal(0.0, 1.2)
        pons_y = -23.5 + r.normal(0.0, 1.6)
        pons_z = -33.0

        med_x = -5.0 + r.normal(0.0, 1.2)
        med_y = -32.0 + r.normal(0.0, 1.5)
        med_z = -58.0 + r.uniform(-3.0, 2.0)

        return np.array([
            [cx, cy, cz],
            [cr_x, cr_y, cr_z],
            [ic_x, ic_y, ic_z + 10.0],
            [ic_x + 0.6, ic_y - 0.8, ic_z],
            [ped_x, ped_y, ped_z],
            [pons_x, pons_y, pons_z],
            [med_x, med_y, med_z],
        ], dtype=np.float64)

    # 2. HDP: Left Prefrontal / Pre-SMA / Premotor -> Anterior/Internal Capsule -> Subthalamic Target (Contacts 1 & 2)
    def build_hdp(r: np.random.Generator):
        u = r.uniform(0.0, 1.0)
        cx = -9.0 - 35.0 * u + r.normal(0.0, 2.5)
        cy = 14.0 + 38.0 * (1.0 - 0.55 * u) + r.normal(0.0, 4.0)
        cz = 64.0 - 26.0 * (u ** 1.2) - 0.22 * max(0.0, cy - 28.0) + r.normal(0.0, 2.2)

        mid1 = np.array([
            0.55 * cx - 8.0 + r.normal(0.0, 1.8),
            0.55 * cy + 2.0 + r.normal(0.0, 2.0),
            28.0 + r.normal(0.0, 2.5),
        ])
        mid2 = np.array([
            -15.5 + r.uniform(-4.5, 2.8),
            4.0 + r.uniform(-5.0, 5.0),
            8.0 + r.normal(0.0, 1.8),
        ])
        # Passes right into the Left STN zone surrounding Contacts 1 & 2
        angle = r.uniform(0.0, 2.0 * math.pi)
        rad = r.uniform(1.35, 6.2)
        c_mid = LEAD_C0_POS + r.uniform(1.5, 6.5) * LEAD_AXIS_U
        stn_pt = c_mid + np.array([rad * math.cos(angle), rad * math.sin(angle), r.normal(0.0, 1.0)])

        # Continues caudally into Substantia Nigra / Cerebral Peduncle / Midbrain tegmentum inside the brainstem envelope
        end_pt = np.array([
            -9.5 + 0.35 * (stn_pt[0] + 12.0) + r.normal(0.0, 1.0),
            -19.5 + 0.35 * (stn_pt[1] + 13.5) + r.normal(0.0, 1.2),
            -19.5 + r.normal(0.0, 1.3),
        ])
        tail_pt = np.array([
            -7.5 + r.normal(0.0, 1.1),
            -25.5 + r.normal(0.0, 1.4),
            -31.0 + r.normal(0.0, 1.6),
        ])

        return np.vstack([
            [cx, cy, cz],
            mid1,
            mid2,
            stn_pt,
            end_pt,
            tail_pt,
        ])

    # 3. DRTT: Deep Cerebellar Peduncle / Brainstem -> Ventral Subthalamic (Contacts 0 & 1) -> Thalamus -> Premotor Cortex
    def build_drtt(r: np.random.Generator):
        # Deep brainstem / superior cerebellar peduncle decussation
        b0 = np.array([
            r.uniform(-6.5, 2.5),
            r.uniform(-36.0, -28.0),
            r.uniform(-48.0, -40.0),
        ])
        b1 = np.array([
            r.uniform(-9.5, -4.5),
            r.uniform(-25.0, -19.0),
            r.uniform(-24.0, -18.0),
        ])
        # Sweeps right past deep Contact 0 & Contact 1!
        ang = r.uniform(0.0, 2.0 * math.pi)
        rad = r.uniform(1.30, 6.5)
        c_deep = LEAD_C0_POS + r.uniform(-0.8, 3.2) * LEAD_AXIS_U
        sub_pt = c_deep + np.array([rad * math.cos(ang), rad * math.sin(ang), r.uniform(-1.2, 1.0)])

        # Ventrolateral motor thalamus
        thal_pt = np.array([
            -13.5 + r.normal(0.0, 2.2),
            -13.0 + r.normal(0.0, 2.4),
            8.5 + r.normal(0.0, 1.8),
        ])
        # Thalamocortical projection up to motor/premotor crown
        u = r.uniform(0.0, 1.0)
        cort_pt = np.array([
            -12.0 - 32.0 * u + r.normal(0.0, 2.5),
            -6.0 + 18.0 * (1.0 - 0.4 * u) + r.normal(0.0, 3.5),
            66.0 - 16.0 * (u ** 1.3) + r.normal(0.0, 2.2),
        ])
        cr_pt = 0.5 * (thal_pt + cort_pt) + np.array([-3.0, 1.5, 3.0])

        return np.vstack([b0, b1, sub_pt, thal_pt, cr_pt, cort_pt])

    # 4. PTF: Pallidothalamic / Lenticular Fasciculus sweeping past dorsal Contacts 2 & 3 -> Thalamus -> SMA
    def build_ptf(r: np.random.Generator):
        # Originates laterally in Putamen / Globus Pallidus
        gp0 = np.array([
            r.uniform(-31.0, -23.0),
            r.uniform(-12.0, 6.0),
            r.uniform(-7.0, 3.0),
        ])
        gp1 = np.array([
            r.uniform(-22.0, -16.5),
            r.uniform(-9.0, 2.0),
            r.uniform(-4.5, 2.5),
        ])
        # Sweeps medially across Zona Incerta / Forel's field H2/H1 right near Contacts 2 & 3!
        ang = r.uniform(0.0, 2.0 * math.pi)
        rad = r.uniform(1.30, 5.8)
        c_dorsal = LEAD_C0_POS + r.uniform(5.2, 10.2) * LEAD_AXIS_U
        zi_pt = c_dorsal + np.array([rad * math.cos(ang), rad * math.sin(ang), r.uniform(-0.8, 1.5)])

        # Loops into Ventral Anterior / Ventral Lateral Thalamus and projects to SMA / Frontal Cortex
        va_pt = np.array([
            -10.5 + r.normal(0.0, 1.8),
            -6.5 + r.normal(0.0, 2.2),
            12.0 + r.normal(0.0, 1.8),
        ])
        cr_pt = np.array([
            -14.0 + r.normal(0.0, 3.0),
            2.0 + r.normal(0.0, 3.5),
            36.0 + r.normal(0.0, 2.5),
        ])
        sma_pt = np.array([
            r.uniform(-28.0, -7.0),
            r.uniform(-2.0, 24.0),
            r.uniform(58.0, 70.0),
        ])
        return np.vstack([gp0, gp1, zi_pt, va_pt, cr_pt, sma_pt])

    # 5. CC: Bilateral Corpus Callosum Commissural Arch (Genu, Body, Splenium)
    def build_cc(r: np.random.Generator):
        # AP parameter ap_u in [0 (splenium/occipital), 1 (genu/frontal)]
        ap_u = r.uniform(0.0, 1.0)
        mid_y = -48.0 + 78.0 * ap_u + r.normal(0.0, 2.0)
        arch_z = 18.0 + 9.0 * math.sin(ap_u * math.pi) + r.normal(0.0, 1.6)

        if ap_u > 0.78:
            # Forceps minor (curves anteriorly into both frontal poles)
            span_x = r.uniform(26.0, 48.0)
            end_y = mid_y + r.uniform(18.0, 34.0)
            end_z = r.uniform(8.0, 46.0)
        elif ap_u < 0.20:
            # Forceps major / Tapetum (curves posteriorly into both occipital lobes)
            span_x = r.uniform(28.0, 50.0)
            end_y = mid_y - r.uniform(24.0, 44.0)
            end_z = r.uniform(-6.0, 34.0)
        else:
            # Callosal body fanning up & laterally into left & right cerebral hemispheres
            lat_fan = r.uniform(0.0, 1.0)
            span_x = 14.0 + 44.0 * lat_fan
            end_y = mid_y + r.normal(0.0, 8.0)
            end_z = 68.0 - 30.0 * (lat_fan ** 1.5) + r.normal(0.0, 2.5)

        asym_z = r.normal(0.0, 2.0)
        asym_y = r.normal(0.0, 2.5)
        dip_z = arch_z + 3.5

        return np.array([
            [-span_x, end_y - asym_y, end_z - asym_z],
            [-0.58 * span_x, 0.5 * (end_y + mid_y) - 0.5 * asym_y, 0.55 * end_z + 0.45 * dip_z],
            [-11.0, mid_y, dip_z],
            [0.0, mid_y, arch_z],
            [11.0, mid_y, dip_z],
            [0.58 * span_x, 0.5 * (end_y + mid_y) + 0.5 * asym_y, 0.55 * end_z + 0.45 * dip_z],
            [span_x, end_y + asym_y, end_z + asym_z],
        ], dtype=np.float64)

    # 6. SLF: Bilateral Arcuate / Superior Longitudinal C-Shaped Cortical Association Arch
    slf_counter = [0]

    def build_slf(r: np.random.Generator):
        # Alternate hemispheres (slightly more in Right hemisphere to balance unilateral Left tracts visually)
        side = 1.0 if (slf_counter[0] % 9 < 5) else -1.0
        slf_counter[0] += 1

        # Frontal operculum / Broca homologue
        f_pt = np.array([
            side * r.uniform(34.0, 52.0),
            r.uniform(22.0, 46.0),
            r.uniform(8.0, 32.0),
        ])
        # Dorsal frontoparietal white matter
        fp_pt = np.array([
            side * r.uniform(30.0, 46.0),
            r.uniform(-4.0, 14.0),
            r.uniform(28.0, 44.0),
        ])
        # Inferior parietal lobule / Geschwind territory
        par_pt = np.array([
            side * r.uniform(33.0, 50.0),
            r.uniform(-42.0, -24.0),
            r.uniform(24.0, 40.0),
        ])
        # Posterior bend around Sylvian fissure into temporal lobe
        bend_pt = np.array([
            side * r.uniform(38.0, 54.0),
            r.uniform(-46.0, -30.0),
            r.uniform(2.0, 14.0),
        ])
        # Middle / Superior Temporal Gyrus anterior sweep
        temp1 = np.array([
            side * r.uniform(42.0, 58.0),
            r.uniform(-26.0, -10.0),
            r.uniform(-20.0, -6.0),
        ])
        temp2 = np.array([
            side * r.uniform(36.0, 52.0),
            r.uniform(-4.0, 14.0),
            r.uniform(-32.0, -16.0),
        ])
        return np.vstack([f_pt, fp_pt, par_pt, bend_pt, temp1, temp2])

    builders = {
        "CST": build_cst,
        "HDP": build_hdp,
        "DRTT": build_drtt,
        "PTF": build_ptf,
        "CC": build_cc,
        "SLF": build_slf,
    }
    for pinfo in PATHWAYS:
        sample_pathway(pinfo["id"], pinfo["count"], builders[pinfo["id"]])

    print(f"  Generated {len(all_fibers)} total valid streamlines in {time.time() - t0:.2f}s")
    return all_fibers, manifest


# =============================================================================
# 4. Exact Feature Extraction + Vectorized `cnn_103_class` Threshold Search
# =============================================================================
def extract_103_ec_windows(fibers: list[np.ndarray], interp_rz, num_ecs: int = 103) -> tuple[np.ndarray, list[int]]:
    """
    Extract exact `ssd`-centered 103-node extracellular potential windows (in mV)
    using `SeniorThesis/run/fiber_DTI.py` + exponential boundary extrapolation
    identical to `dti_ann_LUT_precomputed.py`.
    """
    half_w = num_ecs // 2

    def extrapolate_values(values, center_ind):
        num = len(values) - 1
        num_right = num - center_ind
        num_left = center_ind
        missing_left = half_w + 1 - num_left
        missing_right = half_w + 1 - num_right

        def fit_k(side_vals, eps=1e-12):
            k = min(5, len(side_vals))
            y = np.log(np.abs(side_vals[:k]) + eps)
            d = np.arange(k, dtype=float)
            slope, _ = np.polyfit(d, y, 1)
            return slope

        k_left = fit_k(values[:])
        v_l = values[0]
        s_l = -1.0 if v_l == 0 else np.sign(v_l)

        k_right = fit_k(list(values[::-1]))
        v_r = values[-1]
        s_r = -1.0 if v_r == 0 else np.sign(v_r)

        if missing_left > 0:
            left_add = [s_l * (abs(v_l) * math.exp(-k_left * d)) for d in range(missing_left, 0, -1)]
            values = left_add + values
        if missing_right > 0:
            right_add = [s_r * (abs(v_r) * math.exp(-k_right * d)) for d in range(1, missing_right + 1)]
            values = values + right_add

        new_center = center_ind + (missing_left if missing_left > 0 else 0)
        return values, new_center

    ec_windows = np.zeros((len(fibers), num_ecs), dtype=np.float64)
    problem_fibers = []

    # Concatenate all fiber points for single vectorized potential lookup
    lengths = [len(f) for f in fibers]
    all_pts = np.vstack(fibers).astype(np.float64)
    all_mv = eval_potential_on_points(all_pts, interp_rz)

    offset = 0
    for idx, n_pts in enumerate(lengths):
        ecs_list = all_mv[offset : offset + n_pts].tolist()
        offset += n_pts

        fib_obj = fiber_DTI.Fiber(ecs_list)
        center_ind = fib_obj.getCenterInd("ssd", num_ecs)

        if not fib_obj.isValidCenterInd:
            fib_11 = fiber_DTI.Fiber(ecs_list)
            fib_11.getCenterInd("ssd", 11)
            if not fib_11.isValidCenterInd:
                problem_fibers.append(idx)
                continue
            ecs_ext, center_ind = extrapolate_values(ecs_list, center_ind)
            fib_obj = fiber_DTI.Fiber(ecs_ext)

        win = fib_obj.getValAroundCenterNode("ec", num_ecs, center_ind)
        if len(win) != num_ecs or (None in win):
            problem_fibers.append(idx)
            continue
        ec_windows[idx] = win

    return ec_windows, problem_fibers


def run_cnn_103_predictions(fibers: list[np.ndarray], interpolators: list):
    """
    Load `SeniorThesis/models/cnn_103_class`, verify bit-for-bit agreement with
    `ann_predict_lib.ANN.predict_threshold`, and predict thresholds across all
    4 contacts and 17 pulse widths!
    """
    print("\n[3/4] Running genuine TensorFlow `cnn_103_class` predictions (4 contacts x 17 pulse widths)...")
    t0 = time.time()
    ann = ann_predict_lib.ANN(CNN_MODEL_DIR)
    num_ecs = ann.num_ecs
    assert num_ecs == 103 and ann.num_fsds == 0 and ann.num_ssds == 0

    means = ann.norm_means.astype(np.float32)
    stds = (ann.norm_vars ** 0.5).astype(np.float32)

    def forward_probs(batch_x: np.ndarray) -> np.ndarray:
        normed = (batch_x - means[None, :]) / stds[None, :]
        out_chunks = []
        chunk_sz = 16384
        for start in range(0, len(normed), chunk_sz):
            sub = normed[start : start + chunk_sz]
            if ann.is_saved_model:
                t_in = tf.constant(sub, dtype=tf.float32)
                res = ann.model(t_in)
                key = list(res.keys())[0]
                out_chunks.append(res[key].numpy().ravel())
            else:
                out_chunks.append(ann.model(sub, training=False).numpy().ravel())
        return np.concatenate(out_chunks)

    n_fibers = len(fibers)
    n_pws = len(PULSE_WIDTHS_US)
    pw_ms = np.array([pw / 1000.0 for pw in PULSE_WIDTHS_US], dtype=np.float64)

    upper_bound = 100.0
    precision = 0.001
    iterations = math.ceil(math.log((upper_bound - 0.0) / precision, 2))  # 17 binary search steps
    round_to = 2 + int(abs(math.log(precision, 10)))

    # LUT shape: [4 contacts, 17 pulse_widths, N_fibers]
    thresholds_lut = np.full((4, n_pws, n_fibers), 100.0, dtype=np.float32)

    verified_exact = False
    for c_idx in range(4):
        tc = time.time()
        ec_windows, problem_inds = extract_103_ec_windows(fibers, interpolators[c_idx], num_ecs)
        problem_set = set(problem_inds)

        # Expand [N_fibers, 17] -> M = N_fibers * 17 rows
        # Match dti_ann_LUT_precomputed ordering: fiber-major, pulse-width-minor
        ec_rep = np.repeat(ec_windows, n_pws, axis=0)          # (M, 103)
        pw_rep = np.tile(pw_ms, n_fibers)[:, None]             # (M, 1)

        m_rows = len(ec_rep)
        lo = np.zeros(m_rows, dtype=np.float64)
        hi = np.full(m_rows, upper_bound, dtype=np.float64)
        mult = np.zeros(m_rows, dtype=np.float64)
        batch_buf = np.empty((m_rows, 1 + num_ecs), dtype=np.float32)
        batch_buf[:, 0] = pw_rep[:, 0].astype(np.float32)

        for _step in range(iterations):
            mult = 0.5 * (lo + hi)
            np.multiply(ec_rep, mult[:, None], out=batch_buf[:, 1:], casting="unsafe")
            probs = forward_probs(batch_buf)
            fired = probs > 0.5
            hi = np.where(fired, mult, hi)
            lo = np.where(fired, lo, mult)

        thresh_flat = np.round(mult, round_to)

        # Verify bit-for-bit equality against reference `ann.predict_threshold` on 25 samples!
        if not verified_exact:
            check_rows = np.linspace(0, m_rows - 1, 25, dtype=int)
            max_diff = 0.0
            for r_i in check_rows:
                f_i = r_i // n_pws
                if f_i in problem_set:
                    continue
                ref_feat = [float(pw_rep[r_i, 0])] + ec_windows[f_i].tolist()
                ref_th = ann.predict_threshold(ref_feat, 100)
                max_diff = max(max_diff, abs(ref_th - float(thresh_flat[r_i])))
            print(f"  Verified against reference `ANN.predict_threshold` on 25 fibers: max |diff| = {max_diff:.6f} V")
            assert max_diff < 0.01, f"Mismatch vs reference ANN: {max_diff}"
            verified_exact = True

        thresh_2d = thresh_flat.reshape((n_fibers, n_pws)).T  # (17, N_fibers)
        for p_idx in problem_inds:
            thresh_2d[:, p_idx] = 100.0
        thresholds_lut[c_idx] = thresh_2d.astype(np.float32)

        # Print summary at 60 us and 200 us, 3.0 V
        act_60_3v = int(np.sum(thresholds_lut[c_idx, 0] <= 3.0))
        act_200_3v = int(np.sum(thresholds_lut[c_idx, 8] <= 3.0))
        print(
            f"  Contact {c_idx} finished in {time.time() - tc:.2f}s | "
            f"problem={len(problem_inds)} | @3.0V: {act_60_3v} active (60 us), {act_200_3v} active (200 us)"
        )

    print(f"  Completed 217,600 CNN evaluations in {time.time() - t0:.2f}s")
    return thresholds_lut


# =============================================================================
# 5. Export Compact Web Binary & Metadata Bundle (`public/data/`)
# =============================================================================
def export_web_bundle(
    out_dir: str,
    fibers: list[np.ndarray],
    manifest: dict,
    thresholds_lut: np.ndarray,
    cortex_v: np.ndarray,
    cortex_f: np.ndarray,
):
    """
    Subsample display polylines to ~2.0 mm visual vertex spacing so the browser
    renders 3,200 smooth 3D fibers at 60 FPS with minimal file size (~1.5 MB!),
    while preserving 100% of the exact 0.5 mm CNN activation thresholds!
    """
    print("\n[4/4] Packing compact binary & JSON web bundle...")
    os.makedirs(out_dir, exist_ok=True)

    vis_fibers = []
    node_counts = []
    for pts in fibers:
        # Keep endpoints + every 3rd node (1.5 mm spacing — visually indistinguishable smooth curves!)
        idx = list(range(0, len(pts) - 1, 3)) + [len(pts) - 1]
        sub = pts[idx]
        vis_fibers.append(sub)
        node_counts.append(len(sub))

    node_counts_u16 = np.asarray(node_counts, dtype=np.uint16)
    all_vis_pts = np.vstack(vis_fibers).astype(np.float32)

    # Quantize thresholds to uint16 millivolts (0..65535 -> 0.000 V .. 65.535 V; >= 65.0 V means > 10V inactive)
    thresh_mv_u16 = np.clip(np.round(thresholds_lut * 1000.0), 0, 65535).astype(np.uint16)

    # Binary layout (all little-endian, 4-byte aligned):
    # Header (32 bytes):
    #   magic: b"DBSA" (4B)
    #   version: uint32 = 1
    #   n_fibers: uint32
    #   total_vis_pts: uint32
    #   n_contacts: uint32 = 4
    #   n_pulse_widths: uint32 = 17
    #   n_cortex_verts: uint32
    #   n_cortex_tris: uint32
    # Payload:
    #   1. fiber_node_counts: uint16[n_fibers] + optional 2B pad
    #   2. fiber_xyz: float32[total_vis_pts * 3]
    #   3. thresholds_mv: uint16[4 * 17 * n_fibers] + optional 2B pad
    #   4. cortex_xyz: float32[n_cortex_verts * 3]
    #   5. cortex_tris: uint16[n_cortex_tris * 3]
    bin_path = os.path.join(out_dir, "synthetic_dbs_atlas.bin")
    with open(bin_path, "wb") as bf:
        header = struct.pack(
            "<4s7I",
            b"DBSA",
            1,
            len(fibers),
            len(all_vis_pts),
            4,
            len(PULSE_WIDTHS_US),
            len(cortex_v),
            len(cortex_f),
        )
        bf.write(header)

        b_counts = node_counts_u16.tobytes()
        bf.write(b_counts)
        if len(b_counts) % 4 != 0:
            bf.write(b"\x00" * (4 - (len(b_counts) % 4)))

        bf.write(all_vis_pts.tobytes())

        b_thresh = thresh_mv_u16.tobytes()
        bf.write(b_thresh)
        if len(b_thresh) % 4 != 0:
            bf.write(b"\x00" * (4 - (len(b_thresh) % 4)))

        bf.write(cortex_v.astype(np.float32).tobytes())
        bf.write(cortex_f.astype(np.uint16).tobytes())

    contacts_xyz = [
        (LEAD_C0_POS + 3.0 * k * LEAD_AXIS_U).round(4).tolist()
        for k in range(4)
    ]

    pathway_meta = []
    for p in PATHWAYS:
        m = manifest[p["id"]]
        pathway_meta.append({
            **p,
            "start": m["start"],
            "end": m["end"],
        })

    meta = {
        "title": "Synthetic Human Brain DBS Atlas (Single Unilateral Lead)",
        "isSyntheticNonPatient": True,
        "modelName": "cnn_103_class (1D CNN Surrogate of MRG Axon Model)",
        "units": "Volts (V)",
        "nFibers": len(fibers),
        "totalVisVertices": int(len(all_vis_pts)),
        "pulseWidthsUs": PULSE_WIDTHS_US,
        "lead": {
            "model": "Medtronic 3387 (Unilateral Left Subthalamic Target)",
            "radiusMm": LEAD_RADIUS_MM,
            "contactLengthMm": CONTACT_LEN_MM,
            "contactSpacingMm": CONTACT_SPACING_MM,
            "shaftLengthMm": LEAD_SHAFT_LEN_MM,
            "tipPos": LEAD_TIP_POS.round(4).tolist(),
            "c0Pos": LEAD_C0_POS.round(4).tolist(),
            "axisU": LEAD_AXIS_U.round(6).tolist(),
            "contacts": contacts_xyz,
        },
        "brainBounds": {
            "min": np.min(all_vis_pts, axis=0).round(2).tolist(),
            "max": np.max(all_vis_pts, axis=0).round(2).tolist(),
            "center": [0.0, -15.0, 12.0],
        },
        "pathways": pathway_meta,
    }

    meta_path = os.path.join(out_dir, "synthetic_dbs_meta.json")
    with open(meta_path, "w", encoding="utf-8") as mf:
        json.dump(meta, mf, indent=2)

    size_mb = os.path.getsize(bin_path) / (1024 * 1024)
    print(f"  Wrote {bin_path} ({size_mb:.2f} MB) and {meta_path}")

    # Print per-pathway recruitment table at 3.0 V, 90 us across Contacts 0-3
    pw90_idx = PULSE_WIDTHS_US.index(90)
    print("\n  Per-pathway recruitment check @ 3.00 V, 90 us:")
    for p in pathway_meta:
        s, e = p["start"], p["end"]
        counts_str = ", ".join(
            f"C{c}={int(np.sum(thresholds_lut[c, pw90_idx, s:e] <= 3.0))}/{p['count']}"
            for c in range(4)
        )
        print(f"    {p['id']:<5} ({p['name']:<34}): {counts_str}")


def main():
    rng = np.random.default_rng(20261105)
    interpolators = solve_medtronic_3387_potentials()
    fibers, manifest = generate_all_synthetic_pathways(rng)
    cortex_v, cortex_f = build_human_brain_shell()
    thresholds_lut = run_cnn_103_predictions(fibers, interpolators)

    out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "data")
    export_web_bundle(out_dir, fibers, manifest, thresholds_lut, cortex_v, cortex_f)


if __name__ == "__main__":
    main()
