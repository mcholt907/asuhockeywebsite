# Request Helper with Retry Logic for Python
import time
import requests
from typing import Optional, Dict
from config import scraper_config as config

def request_with_retry(url: str, headers: Dict[str, str], max_retries: int = None, 
                       timeout: int = None) -> Optional[requests.Response]:
    """
    Makes an HTTP GET request with retry logic and exponential backoff.
    
    Args:
        url: The URL to request
        headers: HTTP headers to include
        max_retries: Maximum number of retry attempts (defaults to config)
        timeout: Request timeout in seconds (defaults to config)
    
    Returns:
        Response object or None if all retries failed
    """
    max_retries = max_retries or config.MAX_RETRIES
    timeout = timeout or config.REQUEST_TIMEOUT
    
    for attempt in range(max_retries):
        try:
            response = requests.get(url, headers=headers, timeout=timeout)
            response.raise_for_status()
            return response
        except requests.exceptions.HTTPError as e:
            # Don't retry on 4xx errors (client errors)
            if 400 <= e.response.status_code < 500:
                raise
            # Retry on 5xx errors (server errors)
            if attempt == max_retries - 1:
                raise
        except requests.exceptions.RequestException as e:
            # Retry on network errors
            if attempt == max_retries - 1:
                raise
        
        # Calculate delay with exponential backoff
        delay = min(
            config.RETRY_INITIAL_DELAY * (2 ** attempt),
            config.RETRY_MAX_DELAY
        )
        print(f"[Request Helper] Attempt {attempt + 1}/{max_retries} failed for {url}, retrying in {delay:.2f}s...")
        time.sleep(delay)
    
    return None

def delay_between_requests(delay_seconds: float = None):
    """
    Adds a delay between requests to respect rate limiting.
    
    Args:
        delay_seconds: Delay in seconds (defaults to config)
    """
    delay = delay_seconds or config.REQUEST_DELAY
    time.sleep(delay)

