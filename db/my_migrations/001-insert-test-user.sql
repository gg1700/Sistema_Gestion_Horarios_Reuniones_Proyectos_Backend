INSERT INTO public."user" (handle_name, name, first_surname, email, password_hash)
VALUES ('usuario-prueba', 'Usuario', 'Prueba', 'usuario.prueba@local.test', '$2b$10$iwRHtrztOYaxJb3X1C3Cs.zLVpB7UgMpov9B27EqMOjR1h/N6MUu.')
ON CONFLICT DO NOTHING;
