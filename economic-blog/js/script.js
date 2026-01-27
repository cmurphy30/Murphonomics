/* ============================================
   ECONOMIC INSIGHTS DASHBOARD - JAVASCRIPT
   This file adds interactive features to the website:
   - Hamburger menu toggling
   - Filter functionality for content
   - Smooth scrolling between sections
   - Active navigation link highlighting
   - Animation effects when scrolling
   ============================================ */

/* Wait for the HTML to fully load before running scripts */
document.addEventListener('DOMContentLoaded', () => {
    /* Initialize all interactive features when page loads */
    initializeHamburger();    /* Set up the mobile menu */
    initializeFilters();      /* Set up content filtering */
    initializeSmoothScroll(); /* Set up smooth scrolling to sections */
    initializeNavigation();   /* Set up active navigation highlighting */
});

/* ============================================
   HAMBURGER MENU - Mobile navigation toggle
   Handles opening/closing the menu on mobile devices
   ============================================ */

function initializeHamburger() {
    /* Find the hamburger button (three lines icon) */
    const hamburger = document.getElementById('hamburger');
    /* Find the navigation menu */
    const navMenu = document.getElementById('navMenu');

    /* Exit function if hamburger menu doesn't exist */
    if (!hamburger) return;

    /* When hamburger button is clicked */
    hamburger.addEventListener('click', () => {
        /* Toggle (add/remove) the 'active' class to show/hide menu */
        hamburger.classList.toggle('active');
        navMenu.classList.toggle('active');
    });

    /* Close menu when a navigation link is clicked */
    /* Find all navigation links inside the menu */
    const navLinks = navMenu.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        /* Add click listener to each link */
        link.addEventListener('click', () => {
            /* Remove 'active' class to hide the menu */
            hamburger.classList.remove('active');
            navMenu.classList.remove('active');
        });
    });

 * ============================================
   FILTER FUNCTIONALITY - Show/hide content by category
   Allows users to filter posts by type (All, News, Analysis, etc.)
   ============================================ */

function initializeFilters() {
    /* Find all filter buttons (Category buttons like "All", "News", etc.) */
    const filterButtons = document.querySelectorAll('.filter-btn');
    /* Find all post cards that can be filtered */
    const postCards = document.querySelectorAll('.post-card');

    /* Exit if there are no filter buttons */
    if (filterButtons.length === 0) return;

    /* Add click handler to each filter button */
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            /* Remove 'active' class from all buttons first */
            filterButtons.forEach(btn => btn.classList.remove('active'));
            /* Add 'active' class only to the clicked button */
            button.classList.add('active');

            /* Get the filter value from the button's data attribute */
            /* Example: data-filter="news" */
            const filterValue = button.getAttribute('data-filter');

            /* Loop through each post card and show/hide based on filter */
            postCards.forEach(card => {
                /* Get the category of this card from its data attribute */
                /* Example: data-category="news" */
                const categoryValue = card.getAttribute('data-category');

                /* Show or hide the card based on filter match */
                if (filterValue === 'all' || categoryValue === filterValue) {
                    /* Show the card */
                    card.style.display = '';
                    /* Fade in with small delay for smooth effect */
                    setTimeout(() => {
                        card.style.opacity = '1';
                    }, 10);
                } else {
                    /* Hide the card */
                    /* First fade out */
                    card.style.opacity = '0';
                    /* Then hide after animation completes (300ms) */
            // Filter posts
            postCards.forEach(card => {
                const categoryValue = card.getAttribute('data-category');

                if (filterValue === 'all' || categoryValue === filterValue) {
 * ============================================
   SMOOTH SCROLL - Smooth scrolling to page sections
   When clicking links with #anchor, smoothly scroll to that section
   ============================================ */

function initializeSmoothScroll() {
    /* Find all links that point to sections on the page (starting with #) */
    const links = document.querySelectorAll('a[href^="#"]');

    /* Add click handler to each link */
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            /* Get the href value (like "#services") */
            const href = link.getAttribute('href');

            /* Skip if it's just '#' or empty */
            if (href === '#' || href === '#!') return;

            /* Extract the ID from the href (remove the # symbol) */
            const targetId = href.substring(1);
            /* Find the element with that ID */
            const targetElement = document.getElementById(targetId);

            /* If element exists, scroll to it */
            if (targetElement) {
                /* Prevent default instant scroll */
                e.preventDefault();
                /* Calculate position to scroll to (70px from top for sticky nav) */
                const offsetTop = targetElement.offsetTop - 70;
                
 * ============================================
   NAVIGATION ACTIVE LINK - Highlight current section
   Highlights which navigation link matches the currently visible section
   ============================================ */

function initializeNavigation() {
    /* Find all main sections on the page */
    const sections = document.querySelectorAll('section, header');
    /* Find all navigation links in the menu */
    const navLinks = document.querySelectorAll('.nav-link');

    /* Listen for scroll events */
    window.addEventListener('scroll', () => {
        /* Track which section is currently visible */
        let current = '';

        /* Loop through each section */
        sections.forEach(section => {
            /* Get the section's position from top of page */
            const sectionTop = section.offsetTop;
            /* Get the section's height */
            const sectionHeight = section.clientHeight;

            /* Check if we've scrolled past this section */
            /* 200px offset gives some buffer before highlighting */
            if (pageYOffset >= sectionTop - 200) {
                /* This is the current section */
                current = section.getAttribute('id');
            }
        });

        /* Update navigation links to show which is active */
        navLinks.forEach(link => {
            /* Remove 'active' class from all links */
            link.classList.remove('active');
            /* Add 'active' class only to the link matching current section */
    });
}

// ============================================
// NAVIGATION ACTIVE LINK
// ============================================

function initializeNavigation() {
 * ============================================
   ANIMATION ON SCROLL - Fade in elements as you scroll
   Makes cards fade in with a slide-up animation when they come into view
   ============================================ */

function handleScrollAnimations() {
    /* Settings for the Intersection Observer */
    const observerOptions = {
        threshold: 0.1,           /* Trigger when 10% of element is visible */
        rootMargin: '0px 0px -100px 0px'  /* Start animation 100px before reaching bottom */
    };

    /* Create an observer that watches for elements entering the viewport */
    const observer = new IntersectionObserver((entries) => {
        /* Loop through observed elements */
        entries.forEach(entry => {
            /* Check if element is now visible on screen */
            if (entry.isIntersecting) {
                /* Make element fully visible */
                entry.target.style.opacity = '1';
                /* Move element to original position (remove slide-up) */
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    /* Find all elements that should animate on scroll */
    const animateElements = document.querySelectorAll('.post-card, .analysis-card');
    animateElements.forEach(el => {
        /* Start elements as invisible and moved down 20px */
        el.style.opacity = '0';
 * ============================================
   UTILITY FUNCTIONS - Helper functions used throughout the page
   ============================================ */

/* Toggle visibility of an element */
function toggleElement(elementId) {
    /* Find the element by ID */
    const element = document.getElementById(elementId);
    /* If element exists, toggle the 'hidden' class */
    if (element) {
        element.classList.toggle('hidden');
    }
}

/* Set a specific navigation link as active */
function setActiveNavLink(href) {
    /* Find all navigation links */
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        /* Remove 'active' class from all links */
        link.classList.remove('active');
        /* Add 'active' to the link matching the href */
        if (link.getAttribute('href') === href) {
            link.classList.add('active');
        }
    });
}

/* Log page performance information */
function logPerformance() {
    /* Check if browser supports performance API */
    if (window.performance && window.performance.timing) {
        /* Get timing data */
        const timing = window.performance.timing;
        /* Calculate total load time */
        const loadTime = timing.loadEventEnd - timing.navigationStart;
        /* Log to browser console for debugging */
        console.log(`Page load time: ${loadTime}ms`);
    }
}

/* Run performance logging after page fully loads */
// Initialize scroll animations after page load
window.addEventListener('load', handleScrollAnimations);

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Toggle element visibility
function toggleElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.classList.toggle('hidden');
    }
}

// Add active class to navigation link
function setActiveNavLink(href) {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === href) {
            link.classList.add('active');
        }
    });
}

// Log page performance
function logPerformance() {
    if (window.performance && window.performance.timing) {
        const timing = window.performance.timing;
        const loadTime = timing.loadEventEnd - timing.navigationStart;
        console.log(`Page load time: ${loadTime}ms`);
    }
}

window.addEventListener('load', logPerformance);
