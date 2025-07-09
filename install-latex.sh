#!/bin/bash

# LaTeX Installation Script for Ubuntu/Debian (Docker)
echo "Installing LaTeX (TeX Live)..."

# Update package list
apt-get update

# Install basic LaTeX packages
apt-get install -y \
    texlive-latex-base \
    texlive-latex-recommended \
    texlive-latex-extra \
    texlive-fonts-recommended \
    texlive-fonts-extra \
    texlive-lang-german \
    texlive-lang-english

echo "LaTeX installation completed!"
echo "Testing pdflatex..."
pdflatex --version