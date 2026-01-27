import requests
from bs4 import BeautifulSoup
import json
from datetime import datetime
import re
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from config import scraper_config as config
    from utils.request_helper import request_with_retry, delay_between_requests
except ImportError:
    # Fallback if config files don't exist yet
    print("Warning: Config files not found, using defaults")
    class Config:
        BASE_URL = "https://www.eliteprospects.com/team/18066/arizona-state-univ."
        CURRENT_SEASON = "2025-2026"
        FUTURE_SEASONS = ["2026-2027", "2027-2028"]
        USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36"
        REQUEST_TIMEOUT = 15
        MAX_RETRIES = 3
    config = Config()
    
    def request_with_retry(url, headers, max_retries=3, timeout=15):
        return requests.get(url, headers=headers, timeout=timeout)
    
    def delay_between_requests(delay=1.0):
        import time
        time.sleep(delay)

# Helper function to extract season string from URL
def _extract_season_from_url(url):
    match = re.search(r'/(\d{4}-\d{4})/?$', url)
    if match:
        return match.group(1)
    return "unknown_season"

# Core parsing logic, refactored into a helper function
def _fetch_and_parse_players_from_url(url, headers):
    try:
        response = request_with_retry(url, headers, max_retries=config.MAX_RETRIES, timeout=config.REQUEST_TIMEOUT)
        if response is None:
            return []
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        season_for_error = _extract_season_from_url(url)
        print(f"Error fetching URL {url} (Season: {season_for_error}): {e}")
        return [] # Return empty list if fetch fails

    soup = BeautifulSoup(response.content, 'html.parser')
    player_data_list = []
    
    player_bodies = soup.select("table.SortTable_table__jnnJk tbody.SortTable_tbody__VrcrZ")

    for tbody in player_bodies:
        player_rows = tbody.select("tr.SortTable_tr__L9yVC:not(:has(td.SortTable_tsection__ub5LU))")

        for row in player_rows:
            cells = row.select("td.SortTable_trow__T6wLH")
            
            if len(cells) < 10:
                continue

            try:
                number = cells[1].text.strip() if cells[1] else ""
                
                player_cell_link_tag = cells[3].select_one("div.Roster_player__e6EbP a.TextLink_link__RhSiC")
                full_name_with_pos = ""
                player_link = ""
                position = ""

                if player_cell_link_tag:
                    full_name_with_pos = player_cell_link_tag.text.strip()
                    player_link_relative = player_cell_link_tag.get('href')
                    if player_link_relative:
                        player_link = f"https://www.eliteprospects.com{player_link_relative}" if player_link_relative.startswith('/') else player_link_relative
                    
                    pos_match = re.search(r'\s*\(([A-Z/]+)\)$', full_name_with_pos)
                    if pos_match:
                        position = pos_match.group(1)
                        name = re.sub(r'\s*\(([A-Z/]+)\)$', '', full_name_with_pos).strip()
                    else:
                        name = full_name_with_pos
                else:
                    name = cells[3].text.strip()

                age = cells[4].text.strip() if cells[4] else ""
                
                birth_year_span = cells[5].select_one("span")
                birth_year_full_date = birth_year_span.get('title') if birth_year_span and birth_year_span.has_attr('title') else cells[5].text.strip()
                birth_year = ""
                if birth_year_full_date:
                     # Attempt to extract just the year, robustly
                    year_match = re.search(r'(\d{4})', birth_year_full_date)
                    if year_match:
                        birth_year = year_match.group(1)
                    else: # Fallback if title doesn't contain a clear year but cell might
                        birth_year = cells[5].text.strip()


                birthplace_link = cells[6].select_one("a.TextLink_link__RhSiC")
                birthplace = birthplace_link.text.strip() if birthplace_link else cells[6].text.strip()
                
                height = cells[7].text.strip() if cells[7] else ""
                weight = cells[8].text.strip() if cells[8] else ""
                shoots = cells[9].text.strip() if cells[9] else ""
                
                player_data_item = {
                    "number": number,
                    "name": name,
                    "position": position,
                    "age": age,
                    "birth_year": birth_year,
                    "birthplace": birthplace,
                    "height": height,
                    "weight": weight,
                    "shoots": shoots,
                    "player_link": player_link
                }
                player_data_list.append(player_data_item)
            except Exception as e:
                season_for_error = _extract_season_from_url(url)
                print(f"Detailed error processing player row on {url} (Season: {season_for_error}): {e}")
    
    return player_data_list

def scrape_asu_hockey_roster(roster_url, headers):
    print(f"Scraping main roster from: {roster_url}")
    return _fetch_and_parse_players_from_url(roster_url, headers)

def scrape_recruits_for_future_seasons(season_urls, headers):
    recruits_by_season = {}
    for url in season_urls:
        season = _extract_season_from_url(url)
        print(f"Scraping recruits for season {season} from: {url}")
        player_list = _fetch_and_parse_players_from_url(url, headers)
        if player_list: # Only add season if players were found
            recruits_by_season[season] = player_list
        else:
            print(f"No recruits found for season {season} at {url} or page could not be fetched.")
            recruits_by_season[season] = [] # Add empty list to indicate attempt
        # Add delay between requests to respect rate limiting
        delay_between_requests()
    return recruits_by_season

def main_scrape_and_save():
    base_url = config.BASE_URL
    current_roster_season = config.CURRENT_SEASON
    
    main_roster_url = f"{base_url}/{current_roster_season}"
    
    future_season_recruit_urls = [
        f"{base_url}/{season}" for season in config.FUTURE_SEASONS
    ]

    headers = {
        "User-Agent": config.USER_AGENT
    }

    roster_data = scrape_asu_hockey_roster(main_roster_url, headers)
    recruiting_data = scrape_recruits_for_future_seasons(future_season_recruit_urls, headers)
    
    output_data = {
        "last_updated": datetime.now().isoformat(),
        "roster": roster_data,
        "recruiting": recruiting_data
    }

    try:
        with open('asu_hockey_data.json', 'w') as f:
            json.dump(output_data, f, indent=2)
        print(f"Scraping complete. Data saved to asu_hockey_data.json")
        print(f"Scraped {len(roster_data)} players for the main roster ({current_roster_season}).")
        for season, recruits in recruiting_data.items():
            print(f"Scraped {len(recruits)} recruits for the {season} season.")
        if not roster_data and not any(recruiting_data.values()):
             print("Warning: No roster or recruiting data was scraped. Check selectors and website structure on EliteProspects.")

    except IOError as e:
        print(f"Error writing data to asu_hockey_data.json: {e}")
    
    return output_data


if __name__ == "__main__":
    print("Starting ASU Hockey data scrape (Roster & Recruits)...")
    main_scrape_and_save()
