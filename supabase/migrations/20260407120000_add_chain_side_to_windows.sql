-- Add chain_side column to windows table
-- Captures whether the chain slot is on the left or right side of the window

alter table windows
  add column if not exists chain_side text check (chain_side in ('left', 'right'));
