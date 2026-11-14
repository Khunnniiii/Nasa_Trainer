# Nasa Trainer

A small browser-based strategy game inspired by NASA mission planning on Mars. You manage a crewed outpost, allocate limited power, survive environmental threats, and make decisions that affect air, food, radiation exposure, and research progress.

## Overview

This project is a single-page web app built with HTML, CSS, and JavaScript. The game presents a simplified survival simulation where each day the player decides how to distribute power between:

- Life support
- Greenhouse
- Storm shelter
- Science lab

The goal is to keep the crew alive long enough to finish the mission while earning research points and unlock upgrades for later runs.

## Features

- Daily power allocation management
- Realistic Mars hazards including:
  - solar radiation storms
  - dust storms
  - emergency events
- Research and upgrade system
- Earth quiz questions for bonus science points
- Rover mini-game for extra research gains
- NASA-inspired lore and mission facts
- Responsive browser gameplay with no build step

## Gameplay

Each mission lasts a set number of days. You must balance your resources carefully:

- Air keeps the crew alive
- Food sustains the crew
- Radiation exposure must stay under the limit
- Power is limited, so every decision has trade-offs

Successful missions award research points that can be spent on permanent upgrades and next-mission gear.

## Project Structure

- `index.html` — main page shell
- `style.css` — visual styling and layout
- `game.js` — game logic, state, UI, and mission systems

## Running the Game

Since this is a static web project, you can run it in any browser.

### Option 1: Open directly

- Open `index.html` in a browser

### Option 2: Use a local web server

From the project directory:

```bash
python -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

## Notes

The game uses NASA-based examples and real mission facts as educational flavor, but it is designed as an interactive training/simulation experience rather than a scientific simulator.

## License

This project does not currently include a license file.

## Author

Khunnniiii
