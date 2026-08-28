# Physics

The derivations behind `@sohumsuthar/liquid-glass`. This file lives on GitHub
only — it is excluded from the npm tarball, because npm's README renderer does
not support LaTeX and would show it as raw markup. `README.md` carries the same
results in plain text.

---

## 1. The material is a measured transfer, not a look

Sampling macOS 26 Control Center across three backdrops — a near-black desktop,
a violet wallpaper and a blue starfield — the mapping from backdrop luminance to
panel luminance is a single compressive line:

$$L_{\text{glass}} \;=\; 0.58\,L_{\text{backdrop}} \;+\; 34$$

Black ($L = 9$) lifts $4.3\times$ to $L = 37$; an already-light ground barely
moves. One curve, which is why Apple's panels look the same on any wallpaper.

As a compositing operation the slope is `--lg-brightness` and the intercept is
the tint alpha:

$$L_{\text{glass}} \;=\; \underbrace{(1-\alpha)\,\beta}_{\text{slope}}\;L_{\text{backdrop}}
\;+\; \underbrace{255\,\alpha}_{\text{intercept}},
\qquad \alpha = 0.134,\quad \beta = 0.67$$

The two are independent, which is what makes the material tunable: $\alpha$ alone
fixes the black-ground lift (brightness cannot affect it, since $\beta \cdot 0 = 0$),
and $\beta$ alone fixes how much of the backdrop's variation survives.

Because a white scrim and a dimming pass both destroy chroma, saturation has to
put it back:

$$S \;=\; \frac{1}{(1-\alpha)\,\beta} \;\approx\; 1.72$$

which lands glass chroma on the measured $1:1$ with the backdrop.

> **Fit the slope on a bright backdrop.** Two dark references pin the intercept
> but leave the slope under-determined — a flat slab and a transmissive panel
> score nearly the same on a dark ground. Measure *transmission*: Apple's panel
> carries 58% of the backdrop's across-panel variation, $r = +0.69$.

---

## 2. Refraction: Snell through a squircle slab

The glass is a slab on the background plane with a **convex squircle** bezel,
height against normalized distance $x$ from the outer edge:

$$f(x) \;=\; \left(1 - (1-x)^4\right)^{1/4}$$

Its advantage over a circular arc $\sqrt{1-(1-x)^2}$ is a softer transition from
flat interior to curved bezel, so sweeping the profile around a rectangle leaves
no visible inflection.

A vertical viewing ray traced through the slab:

$$
\begin{aligned}
\theta_s(x) &= \arctan f'(x) && \text{surface tilt} = \text{angle of incidence}\\[4pt]
\theta_r(x) &= \arcsin\!\left(\frac{\sin\theta_s}{n}\right) && \text{Snell's law},\; n = 1.5168\ \text{(BK7)}\\[4pt]
t(x) &= T_0 + B\,f(x) && \text{thickness below the entry point}\\[4pt]
d(x) &= t(x)\,\tan\!\left(\theta_s - \theta_r\right) && \text{lateral shift at the background}
\end{aligned}
$$

The exit face is flat with the background directly behind it, so exit refraction
adds no further shift. Displacement is weighted by Fresnel transmittance
$1 - R(\theta_s)$: at the grazing rim the surface stops transmitting and starts
reflecting, which is also the physical justification for the bright rim.

$$R(\theta) = \tfrac{1}{2}\left(r_s^2 + r_p^2\right), \qquad
r_s = \frac{n_1\cos\theta_i - n_2\cos\theta_t}{n_1\cos\theta_i + n_2\cos\theta_t}, \qquad
r_p = \frac{n_2\cos\theta_i - n_1\cos\theta_t}{n_2\cos\theta_i + n_1\cos\theta_t}$$

$R$ rises from 4% at normal incidence to 100% at grazing.

> The 1.x model $d = f'/(1+f'^2) = \tfrac{1}{2}\sin 2\theta$ peaked at a 45°
> slope and fell to zero at the rim — a dead zone exactly where lensing should
> be strongest.

---

## 3. Scale calibration, and the trap in it

`feDisplacementMap` offsets by $\text{scale}\times(C/255 - \tfrac{1}{2})$. With
`primitiveUnits="objectBoundingBox"` and a bezel of $48/512 = 9.4\%$ of the
element, peak displacement is $0.524 \times \text{bezel} \approx 4.9\%$, so:

$$\text{scale} \;=\; 2.008 \times 0.049 \;\approx\; 0.10$$

**The map is stretched to the element**, so the bezel is a percentage of *each
dimension independently*. On a $660\times72$ card a $48/512$ bezel is 62px across
the caps and 7px down the long edges:

$$w_{\text{cap}} = \tfrac{48}{512}\cdot 660 \approx 62\,\text{px}, \qquad
w_{\text{edge}} = \tfrac{48}{512}\cdot 72 \approx 7\,\text{px}$$

That anisotropy is the fisheye, and lowering `scale` does not fix it — it makes a
62px band invisible rather than correct. Narrow the bezel, or use `useLiquidLens`,
which generates a per-element map at real pixel size with a constant-width bezel.

Changing the bezel invalidates the scale above: at $16/512$ the peak is a third
as large, so the equivalent is $\approx 0.3$.

---

## 4. Dispersion

Blue refracts more than red in crown glass ($n_F = 1.5224 > n_C = 1.5143$). Each
channel is displaced at its own Snell scale, isolated with `feColorMatrix`, and
screen-blended back — the channels are disjoint, so screen is addition. The
physical spread is ~1%, invisible at UI scale, so `dispersionScales(strength)`
exaggerates it linearly.
